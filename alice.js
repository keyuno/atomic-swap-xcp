// Import required libraries
const axios = require('axios');
const bitcoinjs_lib = require('bitcoinjs-lib');
const ECPairFactory = require('ecpair').ECPairFactory;
const tinysecp = require('tiny-secp256k1');
const bip68 = require('bip68');

// Set the Bitcoin network (testnet in this case)
const network = bitcoinjs_lib.networks.testnet;

const alice = ECPairFactory(tinysecp).fromWIF('...', network); // Enter generated Alice's Bitcoin private key.
const alicePublicKey = alice.publicKey;
const aliceRecipAddr = bitcoinjs_lib.crypto.hash160(alicePublicKey);

const bob = ECPairFactory(tinysecp).fromWIF('...', network); // Enter generated Bob's Bitcoin private key.
const bobPublicKey = bob.publicKey;
const bobRecipAddr = bitcoinjs_lib.crypto.hash160(bobPublicKey);

// Define a secret and compute its hash
const SECRET = 'secret';
const preimage = Buffer.from(SECRET);
const hash = bitcoinjs_lib.crypto.hash160(preimage);

// Define the relative time-lock sequence
const sequence = bip68.encode({
    blocks: 3
});

// Define the locking script
const lockingScript = bitcoinjs_lib.script.compile([
    bitcoinjs_lib.opcodes.OP_IF, 
    bitcoinjs_lib.script.number.encode(sequence), 
    bitcoinjs_lib.opcodes.OP_CHECKSEQUENCEVERIFY, 
    bitcoinjs_lib.opcodes.OP_DROP, 
    bitcoinjs_lib.opcodes.OP_DUP,
    bitcoinjs_lib.opcodes.OP_HASH160, 
    bobRecipAddr, 
    bitcoinjs_lib.opcodes.OP_EQUALVERIFY, 
    bitcoinjs_lib.opcodes.OP_CHECKSIG, 
    bitcoinjs_lib.opcodes.OP_ELSE, 
    bitcoinjs_lib.opcodes.OP_HASH160,
    hash, 
    bitcoinjs_lib.opcodes.OP_EQUALVERIFY, 
    bitcoinjs_lib.opcodes.OP_DUP, 
    bitcoinjs_lib.opcodes.OP_HASH160,
    aliceRecipAddr, 
    bitcoinjs_lib.opcodes.OP_EQUALVERIFY, 
    bitcoinjs_lib.opcodes.OP_CHECKSIG,
    bitcoinjs_lib.opcodes.OP_ENDIF
]);

// Create the P2SH (Pay-to-Script-Hash) address from the locking script
const p2sh = bitcoinjs_lib.payments.p2sh({
    redeem: {
        output: lockingScript,
        network
    },
    network
});

// Check if we want to generate and display the shared P2SH address or execute a transaction
const generateSharedAddress = process.argv[2] === 'generate';

if (generateSharedAddress) {
    // Display the shared P2SH address
    const sharedAddress = p2sh.address;
    console.log(`Shared Address: ${sharedAddress}`);
    process.exit(0);
}

// Function to get UTXO (Unspent Transaction Output) data from an address
async function getUTXODataFromAddress(source) {
    const url = `https://blockstream.info/testnet/api/address/${source}/utxo`;

    try {
        const response = await axios.get(url);
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
            const utxo = response.data[0];
            const txid = utxo.txid;
            const vout = utxo.vout;
            const value = utxo.value;

            // Fetch the full transaction data for the UTXO
            const fullTxResponse = await axios.get(`https://blockstream.info/testnet/api/tx/${txid}/hex`);
            const fullTransaction = fullTxResponse.data;

            return {
                txid,
                vout,
                fullTransaction,
                value
            };
        } else {
            throw new Error('No UTXO found for the provided address.');
        }
    } catch (error) {
        console.error('Failed to get UTXO data:', error.message);
        throw error;
    }
}

// Function to add inputs to the PSBT (Partially Signed Bitcoin Transaction)
function addInputs(psbt, data, isRedeem) {
    if (isRedeem) {
        psbt.addInput({
            hash: data.txid,
            index: data.vout,
            nonWitnessUtxo: Buffer.from(data.fullTransaction, 'hex'),
            redeemScript: lockingScript,
            value: data.value,
            sequence
        });
    } else {
        psbt.addInput({
            hash: data.txid,
            index: data.vout,
            nonWitnessUtxo: Buffer.from(data.fullTransaction, 'hex'),
            redeemScript: lockingScript,
            value: data.value
        });
    }
}

// Function to add outputs to the PSBT (Partially Signed Bitcoin Transaction)
function addOutputs(psbt, data) {
    const fee = 500; // Fee amount in satoshis
    const totalOutputValue = data.value - fee;
        psbt.addOutput({
            address: '...', //Destination address
            value: totalOutputValue
        });
    }


// Function to prepare the PSBT (Partially Signed Bitcoin Transaction) based on redemption scenario
async function prepareTransaction(isRedeem) {
    const source = p2sh.address; 

    // Get UTXO data from the source address
    const data = await getUTXODataFromAddress(source);
    const psbt = new bitcoinjs_lib.Psbt({ network });

    // Add inputs and outputs to the PSBT
    addInputs(psbt, data, isRedeem);
    addOutputs(psbt, data, isRedeem);

    // Sign the inputs with the appropriate private key (Alice or Bob)
    psbt.data.inputs.forEach((input, idx) => {
        const keyPair = isRedeem ? bob : alice;
        psbt.signInput(idx, keyPair);
    });

    // Finalize the input based on redemption scenario
    if (isRedeem) {
        // Finalize for Bob's redemption scenario
        const finalizeInput = (inputIndex) => {
            const input = psbt.data.inputs[inputIndex];
            const signature = input.partialSig[0].signature;
            const redeemPayment = bitcoinjs_lib.payments.p2sh({
                redeem: {
                    input: bitcoinjs_lib.script.compile([
                        signature,
                        bobPublicKey,
                        bitcoinjs_lib.opcodes.OP_TRUE // Set OP_TRUE for Alice's redemption scenario
                    ]),
                    output: lockingScript
                }
            });

            return {
                finalScriptSig: redeemPayment.input
            };
        };

        psbt.finalizeInput(0, finalizeInput);
    } else {
        // Finalize for Alice's redemption scenario
        const finalizeInput = (inputIndex) => {
            const input = psbt.data.inputs[inputIndex];
            const signature = input.partialSig[0].signature;
            const redeemPayment = bitcoinjs_lib.payments.p2sh({
                redeem: {
                    input: bitcoinjs_lib.script.compile([
                        signature,
                        alicePublicKey,
                        preimage,
                        bitcoinjs_lib.opcodes.OP_FALSE // Set OP_FALSE for Bob's redemption scenario
                    ]),
                    output: lockingScript
                }
            });

            return {
                finalScriptSig: redeemPayment.input
            };
        };

        psbt.finalizeInput(0, finalizeInput);
    }

    // Extract the final transaction in hexadecimal format
    const finalTransaction = psbt.extractTransaction().toHex();
    console.log(`Final transaction: ${finalTransaction}`);
    return finalTransaction;
}

// Function to broadcast the finalized transaction to the network
async function broadcastTransaction(finalTransaction) {
    const url = 'https://blockstream.info/testnet/api/tx';
    const headers = {
        'Content-Type': 'text/plain'
    };

    try {
        const response = await axios.post(url, finalTransaction, { headers });
        console.log('Broadcast response:', response.status, response.statusText);
        console.log('Transaction ID:', response.data);
    } catch (error) {
        console.error('Failed to broadcast transaction:', error.message);
        if (error.response) {
            console.error('Server response:', error.response.status, error.response.statusText);
            console.error('Response data:', error.response.data);
        }
        throw error;
    }
}

// Main asynchronous function to prepare and broadcast the transaction.
(async () => {
    const isRedeem = process.argv[2] === 'bob';

    try {
        const finalTransactionHex = await prepareTransaction(isRedeem);
        await broadcastTransaction(finalTransactionHex);
    } catch (error) {
        console.error('Error while preparing or broadcasting transaction:', error);
    }
})();
