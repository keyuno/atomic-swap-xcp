# Atomic Swap between Bitcoin and CounterParty Assets (Testnet Demo)

The following documentation outlines a trustless atomic swap process between two parties, Alice and Bob, using the CounterParty protocol and BitcoinJS libraries. This atomic swap allows Alice to exchange her Bitcoin (BTC) for Bob's CounterParty asset (e.g., XCP) based on a predetermined exchange rate and amount.

### Important Notes

1. This code is intended for demonstration purposes and assumes the use of Bitcoin's testnet. In a real-world scenario, use appropriate precautions and security measures.

2. Handle real Bitcoin transactions carefully and follow best practices to avoid any loss of funds.

## Overview

Atomic swaps enable the exchange of assets between two parties without the need for a trusted intermediary. The process involves the following key steps:

1. Initial Setup:
   - Alice and Bob agree to exchange assets (BTC and XCP).
   - They determine the exchange rate and the amount to be traded.

2. Preimage Generation: Alice generates a secret preimage that will be used to unlock the Hash Time Locked Contracts (HTLCs). She keeps this preimage confidential and does not share it with Bob.

3. Hash Locking: Alice creates a hash of the secret preimage and provides it to Bob. Bob uses this hash to lock his HTLC. The hash acts as proof that the preimage exists without revealing the actual preimage.

4. Hash Time Locked Contracts (HTLCs): To facilitate the atomic swap, both Alice and Bob create HTLCs. These contracts ensure that both parties must reveal a secret preimage to claim their funds, making the exchange trustless.

5. Time Constraints: The HTLCs have specific time constraints. Alice's HTLC has a longer time constraint compared to Bob's HTLC. This longer time constraint allows Bob enough time to claim his asset from Alice's locked HTLC after she reveals the preimage. This process adds an extra layer of security and prevents Alice from attempting to undercut the transaction before Bob can complete the swap.

6. Verification: Both parties verify each other's contracts to ensure that the agreed-upon conditions are accurately represented.

7. Contract Funding: Alice and Bob fund their respective HTLCs with the assets they want to trade. The assets are locked in the HTLCs but cannot be immediately spent.

8. Claiming the Funds: When Alice is ready to proceed with the atomic swap, she reveals her secret preimage by claiming the locked BTC from the HTLC Bob created. This action also allows Bob to claim the locked XCP from the HTLC that Alice created.

The use of HTLCs and time constraints ensures that the exchange is trustless and secure. If either party fails to fulfill their part of the deal, the funds in the HTLCs can be refunded to their respective owners, preventing potential losses.


## Code Implementation

The code provided in this repository demonstrates how to perform the atomic swap between Alice and Bob using the CounterParty protocol and BitcoinJS libraries. Before running the code, make sure you have Node.js and npm installed on your machine.

### Getting Started

1. Clone the `atomic-swap-xcp` repository to your local machine.

```bash
git clone https://github.com/keyuno/atomic-swap-xcp
```

2. Navigate to the cloned repository directory.

```bash
cd atomic-swap-xcp
```

3. Install the required dependencies:

```bash
npm install
```

### Generating Private Keys

Generate private keys for Alice and Bob: 

```bash
node keys.js
```
Copy and paste the generated private keys into the respective variables in the `bob.js` and `alice.js` files.


### Generating Shared Address

To generate a shared address for Alice and Bob, use the following command:

```bash
node bob.js generate
```

Next, proceed to send the agreed amount of testnet XCP to the shared address. Additionally, ensure that you send some testnet Bitcoin to cover the transaction fees.


### Preparing and Broadcasting CounterParty Transaction

To prepare and broadcast the transaction, specify whether it's Bob's or Alice redemption scenario. 

For Bob's redemption:

```bash
node bob.js 
```

For Alice's redemption:

```bash
node bob.js alice
```

The script will then create and broadcast the transaction using the specified redemption scenario. The script `alice.js` is used to redeem Bitcoin, while `secret.js` is used to extract the secret from the transaction. In this demonstration, different passphrases are used for Bitcoin and XCP transactions solely for illustrative purposes. In a real-world atomic swap scenario, when constructing an actual atomic swap, Alice will provide Bob with the hash of the secret, which Bob will use to create the lock script.

The `sweep.js` script is provided to test the sweep function and can be used for bundling sales and ownership transfer. Ensure that you have an additional 0.5 testnet XCP fee available for the transaction to work correctly.

The `multi.js` script is for testing other transaction encoding methods.


## References

1. [A Step-by-Step Guide to Creating and Spending Coins with Bitcoin Scripts using BitcoinJS-lib](https://dev.to/eunovo/unlocking-the-power-of-p2wsh-a-step-by-step-guide-to-creating-and-spending-coins-with-bitcoin-scripts-using-bitcoinjs-lib-a7o)

2. [P2SH support for Counterparty](https://github.com/rubensayshi/counterparty-p2sh-demo)

3. [bcoin.io - Atomic Swap Guide](https://bcoin.io/guides/swaps.html)


These references will be helpful for users who want to delve deeper into the underlying mechanisms and expand their understanding of the topics covered in this repository.


### Disclaimer

By using this code, you assume all risks and responsibilities for any potential loss of coins or other damages that may occur. The authors of this code do not take responsibility for any such loss or damages. Before using this code in a real-world setting, make sure to thoroughly understand the risks associated with cryptocurrencies, employ proper security measures, and exercise caution in all transactions.

## License

This code is licensed under the MIT License. See the `LICENSE` file for more information.

---
