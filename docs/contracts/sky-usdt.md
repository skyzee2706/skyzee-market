# SkyUSDT — Faucet Token

`SkyUSDT` is a mock ERC-20 token used as the betting currency in SKY Market. It is not pegged to real USDT — it exists purely for testnet experimentation.

---

## Properties

| Property | Value |
|---|---|
| Name | Sky USDT |
| Symbol | SKY-USDT |
| Decimals | 6 |
| Network | Ethereum Sepolia |

---

## Faucet

Anyone can call `faucet()` to receive a fixed amount of SkyUSDT. The smart contract enforces a **cooldown period** between claims per wallet address to prevent farming.

```solidity
function faucet() external {
    require(block.timestamp > lastClaim[msg.sender] + COOLDOWN, "Wait before claiming again");
    lastClaim[msg.sender] = block.timestamp;
    _mint(msg.sender, FAUCET_AMOUNT);
}
```

The frontend provides a modal UI to call this function.

---

## Usage in Markets

When a user places a bet:
1. They call `approve(marketAddress, amount)` on SkyUSDT
2. The `PredictionMarket` calls `transferFrom(user, address(this), amount)` to pull in the bet
3. Funds are held in the market contract until resolution
4. Winners receive SkyUSDT back via `claim()`

---

## No Real Value

SkyUSDT has no monetary value. It cannot be bridged, sold, or exchanged for real assets. It is test infrastructure only.
