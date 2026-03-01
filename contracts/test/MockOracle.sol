// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../IPriceOracle.sol";

/// @dev In-memory mock oracle for testing. Not deployed on any live network.
contract MockOracle is IPriceOracle {
    uint256 private _price;

    constructor(uint256 initialPrice) {
        _price = initialPrice;
    }

    function setPrice(uint256 newPrice) external {
        _price = newPrice;
    }

    function getPrice() external view override returns (uint256) {
        return _price;
    }
}
