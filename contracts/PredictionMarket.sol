// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IPriceOracle.sol";

/**
 * @title PredictionMarket
 * @notice Binary YES/NO prediction market settled by an on-chain oracle.
 *         Betting is done with SkyUSDT (ERC-20, 6 decimals).
 *         1% platform fee collected upfront as ETH at bet time (based on ETH/USD price).
 *         No fee is taken from winnings — full payout goes to winners.
 */
contract PredictionMarket is Ownable {
    // ── Token ─────────────────────────────────────────────────────────────
    IERC20  public immutable token;     // SkyUSDT

    // ── Oracles ───────────────────────────────────────────────────────────
    IPriceOracle public immutable oracle;        // BTC/USD — settlement
    IPriceOracle public immutable ethUsdOracle;  // ETH/USD — fee calculation

    // ── Market params ─────────────────────────────────────────────────────
    string  public question;
    uint256 public strikePrice;
    uint256 public endTime;
    uint256 public bettingEndTime; // Betting closes before settlement

    // ── State ─────────────────────────────────────────────────────────────
    bool    public resolved;
    bool    public result;   // true = YES won, false = NO won
    uint256 public settlementPrice;

    uint256 public yesPool;
    uint256 public noPool;

    // ── User positions ────────────────────────────────────────────────────
    mapping(address => uint256) public yesBets;
    mapping(address => uint256) public noBets;
    mapping(address => bool)    public claimed;

    // ── Fee ───────────────────────────────────────────────────────────────
    address public feeWallet;

    // ── Price proxy (for frontend) ────────────────────────────────────────
    // Returns latest YES price as a fraction of 1e18 (50% = 5e17)
    function yesPrice() external view returns (uint256) {
        uint256 total = yesPool + noPool;
        if (total == 0) return 5e17;  // default 50/50
        return (yesPool * 1e18) / total;
    }

    // ── Events ────────────────────────────────────────────────────────────
    event BetPlaced(address indexed user, bool isYes, uint256 amount, uint256 ethFeePaid);
    event MarketResolved(bool result, uint256 oraclePrice);
    event Claimed(address indexed user, uint256 payout);

    // ── Modifiers ─────────────────────────────────────────────────────────
    modifier beforeEnd() {
        require(block.timestamp < bettingEndTime, "Market: betting closed");
        _;
    }

    modifier afterEnd() {
        require(block.timestamp >= endTime, "Market: not ended yet");
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────
    constructor(
        address _token,
        address _oracle,
        address _ethUsdOracle,
        string  memory _question,
        uint256 _strikePrice,
        uint256 _endTime,
        uint256 _bettingEndTime,
        address _owner,
        address _feeWallet
    ) Ownable(_owner) {
        token          = IERC20(_token);
        oracle         = IPriceOracle(_oracle);
        ethUsdOracle   = IPriceOracle(_ethUsdOracle);
        question       = _question;
        strikePrice    = _strikePrice;
        endTime        = _endTime;
        bettingEndTime = _bettingEndTime;
        feeWallet      = _feeWallet;
    }

    // ── Fee Calculation ───────────────────────────────────────────────────

    /**
     * @notice Calculate the ETH fee required for a given USDT bet amount.
     *         Fee = 1% of bet value, converted to ETH using current ETH/USD oracle price.
     * @param amount  USDT amount in 6-decimal units (e.g. 100 USDT = 100_000_000)
     * @return feeWei ETH fee in wei
     *
     * Derivation:
     *   feeUSD  = amount / 1e6 / 100                  (1% of bet in USD)
     *   ethPrice = ethUsdOracle.getPrice() / 1e8       (USD per ETH)
     *   feeETH  = feeUSD / ethPrice                    (ETH units)
     *   feeWei  = feeETH * 1e18
     *           = amount * 1e18 / (1e6 * 100) / (ethPrice / 1e8)
     *           = amount * 1e18 * 1e8 / (1e8 * ethPrice)
     *           = amount * 1e18 / ethPrice
     */
    function calcEthFee(uint256 amount) public view returns (uint256 feeWei) {
        uint256 ethPrice = ethUsdOracle.getPrice(); // ETH/USD price, 8 decimals
        require(ethPrice > 0, "ETH oracle error");
        feeWei = (amount * 1e18) / ethPrice;
    }

    // ── Betting ───────────────────────────────────────────────────────────

    /**
     * @notice Buy YES shares. Caller must:
     *   1. approve this contract to spend `amount` SkyUSDT
     *   2. send msg.value >= calcEthFee(amount) ETH as the platform fee
     */
    function buyYes(uint256 amount) external payable beforeEnd {
        require(amount > 0, "Amount must be > 0");
        uint256 fee = calcEthFee(amount);
        require(msg.value >= fee, "Insufficient ETH fee");

        // Refund any excess ETH sent
        if (msg.value > fee) {
            payable(msg.sender).transfer(msg.value - fee);
        }
        // Forward fee to dev wallet
        payable(feeWallet).transfer(fee);

        token.transferFrom(msg.sender, address(this), amount);
        yesBets[msg.sender] += amount;
        yesPool             += amount;
        emit BetPlaced(msg.sender, true, amount, fee);
    }

    /**
     * @notice Buy NO shares. Caller must:
     *   1. approve this contract to spend `amount` SkyUSDT
     *   2. send msg.value >= calcEthFee(amount) ETH as the platform fee
     */
    function buyNo(uint256 amount) external payable beforeEnd {
        require(amount > 0, "Amount must be > 0");
        uint256 fee = calcEthFee(amount);
        require(msg.value >= fee, "Insufficient ETH fee");

        if (msg.value > fee) {
            payable(msg.sender).transfer(msg.value - fee);
        }
        payable(feeWallet).transfer(fee);

        token.transferFrom(msg.sender, address(this), amount);
        noBets[msg.sender] += amount;
        noPool             += amount;
        emit BetPlaced(msg.sender, false, amount, fee);
    }

    // ── Resolution ────────────────────────────────────────────────────────

    /**
     * @notice Resolve the market using the oracle price. Anyone can call after endTime.
     */
    function resolve() external afterEnd {
        require(!resolved, "Already resolved");
        uint256 price = oracle.getPrice();
        result = price >= strikePrice;  // YES wins if price >= strikePrice
        settlementPrice = price;
        resolved = true;
        emit MarketResolved(result, price);
    }

    /**
     * @notice EXCLUSIVE FOR ZERO-GAS PM2 SIMULATION:
     *         Resolves the market using a specific price injected by the PM2 bot 
     *         directly from the Binance API, perfectly matching the frontend chart.
     *         Only callable by the Factory (Owner).
     */
    function resolveWithCustomPrice(uint256 price) external afterEnd onlyOwner {
        require(!resolved, "Already resolved");
        result = price >= strikePrice; 
        settlementPrice = price;
        resolved = true;
        emit MarketResolved(result, price);
    }

    // ── Claim ─────────────────────────────────────────────────────────────

    /**
     * @notice Winners claim their full proportional share. No fee deducted — fee was paid upfront.
     */
    function claim() external {
        require(resolved, "Market: not resolved yet");
        require(!claimed[msg.sender], "Already claimed");

        uint256 userBet = result ? yesBets[msg.sender] : noBets[msg.sender];
        require(userBet > 0, "No winning bet");

        claimed[msg.sender] = true;

        uint256 winPool = result ? yesPool : noPool;
        uint256 total   = yesPool + noPool;

        // Full proportional payout — no fee deduction
        uint256 payout = (userBet * total) / winPool;

        token.transfer(msg.sender, payout);
        emit Claimed(msg.sender, payout);
    }

    // ── Views ─────────────────────────────────────────────────────────────

    function getUserPosition(address user) external view returns (
        uint256 _yesBet,
        uint256 _noBet,
        bool    _claimed
    ) {
        return (yesBets[user], noBets[user], claimed[user]);
    }
}
