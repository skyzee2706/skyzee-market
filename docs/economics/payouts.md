# Payout Formula

## Proportional Model

SKY Market uses a **parimutuel (proportional)** payout model. Losers' funds are redistributed to winners proportionally based on their share of the winning pool.

---

## Formula

```
payout = (user_bet / winning_pool) × total_pool
```

**Where:**
- `user_bet` — amount the user bet on the winning side
- `winning_pool` — total amount bet on the winning side (yesPool or noPool)
- `total_pool` — `yesPool + noPool`

---

## Example

| | Amount |
|---|---|
| total YES bets | 1,000 USDT (user bet 200 of these) |
| total NO bets | 600 USDT |
| total pool | 1,600 USDT |
| **YES wins** | |
| User's share | 200 / 1,000 = 20% |
| User's payout | 20% × 1,600 = **320 USDT** |
| Net profit | 320 - 200 = **+120 USDT** |

---

## On-Chain Implementation

```solidity
function claim() external {
    require(resolved, "Not settled");
    uint256 userBet = result ? yesBets[msg.sender] : noBets[msg.sender];
    require(userBet > 0, "No winning bet");
    require(!claimed[msg.sender], "Already claimed");

    uint256 winPool = result ? yesPool : noPool;
    uint256 payout = (userBet * totalPool()) / winPool;

    claimed[msg.sender] = true;
    token.transfer(msg.sender, payout);
    emit Claimed(msg.sender, payout);
}
```

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| All bets on one side | Winners split 100% of pool (guaranteed profit) |
| Zero bets on one side | The other side wins by default; full pool goes to non-zero side |
| User bets on losing side | No payout — bet is absorbed by winning pool |
| User already claimed | Reverts with "Already claimed" |

---

## Payout Preview

The frontend computes an **estimated payout** before placing a bet, using the current pool state:

```ts
function calcPayout(amount: string, isSideYes: boolean): string {
    const amt = parseUnits(amount, 6);
    const winPool = isSideYes ? yesPool + amt : noPool + amt;
    const total = totalPool + amt;
    const gross = (amt * total) / winPool;
    return formatUnits(gross, 6);
}
```

This includes the user's own bet in the calculation to reflect the actual pool after their bet lands.
