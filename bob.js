// Import required libraries
const axios = require('axios'); 
const bitcoinjs_lib = require('bitcoinjs-lib');  
const ECPairFactory = require('ecpair').ECPairFactory;  
const tinysecp = require('tiny-secp256k1');  
const bip68 = require('bip68');  

const network = bitcoinjs_lib.networks.testnet;  // Set the Bitcoin testnet network.

const alice = ECPairFactory(tinysecp).fromWIF('...', network); // Enter generated Alice's Bitcoin private key.
const alicePublicKey = alice.publicKey;
const aliceRecipAddr = bitcoinjs_lib.crypto.hash160(alicePublicKey);

const bob = ECPairFactory(tinysecp).fromWIF('...', network); // Enter generated Bob's Bitcoin private key.
const bobPublicKey = bob.publicKey;
const bobRecipAddr = bitcoinjs_lib.crypto.hash160(bobPublicKey);

const SECRET = 'word';  // A secret value used to create a hash.
const preimage = Buffer.from(SECRET);  // Convert the secret to a buffer.
const hash = bitcoinjs_lib.crypto.hash160(preimage);  // Calculate the hash of the secret.

// Define the relative time-lock sequence
const sequence = bip68.encode({
    blocks: 10
});

// Define the locking script.
const lockingScript = bitcoinjs_lib.script.compile([
    bitcoinjs_lib.opcodes.OP_IF,
    bitcoinjs_lib.script.number.encode(sequence),
    bitcoinjs_lib.opcodes.OP_CHECKSEQUENCEVERIFY,
    bitcoinjs_lib.opcodes.OP_DROP,
    bitcoinjs_lib.opcodes.OP_DUP,
    bitcoinjs_lib.opcodes.OP_HASH160,
    aliceRecipAddr,
    bitcoinjs_lib.opcodes.OP_EQUALVERIFY,
    bitcoinjs_lib.opcodes.OP_CHECKSIG,
    bitcoinjs_lib.opcodes.OP_ELSE,
    bitcoinjs_lib.opcodes.OP_HASH160,
    hash,
    bitcoinjs_lib.opcodes.OP_EQUALVERIFY,
    bitcoinjs_lib.opcodes.OP_DUP,
    bitcoinjs_lib.opcodes.OP_HASH160,
    bobRecipAddr,
    bitcoinjs_lib.opcodes.OP_EQUALVERIFY,
    bitcoinjs_lib.opcodes.OP_CHECKSIG,
    bitcoinjs_lib.opcodes.OP_ENDIF
]);

// Create a Pay-to-Script-Hash (P2SH) address from the locking script and the network.
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
    // Print the shared P2SH address if the script is generating it.
    const sharedAddress = p2sh.address;
    console.log(`Shared Address: ${sharedAddress}`);
    process.exit(0);
}

// Function to create an unsigned transaction.
async function createUnsignedTransaction(source, asset, destination, pubkey, quantity) {
    const url = 'https://public.coindaddy.io:14001/api/';
    const auth = {
        username: 'rpc',
        password: '1234'
    };
    const headers = {
        'Content-Type': 'application/json'
    };
    const payload = {
        method: 'create_send',
        params: {
            source,
            asset,
            destination,
            pubkey,
            quantity,
            allow_unconfirmed_inputs: true
        },
        jsonrpc: '2.0',
        id: 1
    };

    // Send a POST request to create the unsigned transaction.
    try {
        const response = await axios.post(url, payload, {
            headers,
            auth
        });
        console.log('Server response:', response.status, response.statusText);
        console.log('Response data:', response.data);

        const { data } = response;
        if (!data || !data.result || data.error) {
            console.error('Server error:', data.error);
            throw new Error(`Invalid server response. Error message: ${data.error.message}`);
        }

        return data.result; // Returning the unsigned transaction data
    } catch (error) {
        console.error('Failed to create unsigned transaction:', error.message);
        if (error.response) {
            console.error('Server response:', error.response.status, error.response.statusText);
            console.error('Response data:', error.response.data);
        }
        throw error;
    }
}

// Function to prepare a transaction using the unsigned data.
async function prepareCounterPartyTransaction(isRedeem) {
    const source = p2sh.address;
    const asset = 'XCP'; // Select asset name.
    const destination = '...'; // Enter destination address.
    const pubkey = (isRedeem ? alicePublicKey : bobPublicKey).toString('hex');
    const quantity = 1 * 1e8; // Choose quantity. 
    let unsignedTxData = null;

    try {
        unsignedTxData = await createUnsignedTransaction(source, asset, destination, pubkey, quantity);
    } catch (error) {
        console.error('Error:', error);
        return;
    }

    // Parse the unsigned transaction data and create a PSBT (Partially Signed Bitcoin Transaction).
    const tx = bitcoinjs_lib.Transaction.fromHex(unsignedTxData);
    const psbt = new bitcoinjs_lib.Psbt({
        network
    });

    // Function to fetch UTXO data for the given source address.
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

    // Function to add inputs to the PSBT based on the fetched UTXO data.
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

    // Function to add outputs to the PSBT based on the original transaction.
    function addOutputs(psbt, tx) {
        tx.outs.forEach((output) => {
            psbt.addOutput({
                script: output.script,
                value: output.value
            });
        });
    }

    // Fetch UTXO data for the source address and add inputs and outputs to the PSBT.
    const data = await getUTXODataFromAddress(source);
    addInputs(psbt, data, isRedeem); 
    addOutputs(psbt, tx);

    // Sign the inputs with the appropriate private key (Alice or Bob)
    tx.ins.forEach((_, idx) => {
        const keyPair = isRedeem ? alice : bob;
        psbt.signInput(idx, keyPair);
    });

    // Finalize the input and prepare the final transaction
    if (isRedeem) {
        const finalizeInput = (inputIndex) => {
            const input = psbt.data.inputs[inputIndex];
            const signature = input.partialSig[0].signature;
            const redeemPayment = bitcoinjs_lib.payments.p2sh({
                redeem: {
                    input: bitcoinjs_lib.script.compile([
                        signature,
                        alicePublicKey,
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
        const finalizeInput = (inputIndex) => {
            const input = psbt.data.inputs[inputIndex];
            const signature = input.partialSig[0].signature;
            const redeemPayment = bitcoinjs_lib.payments.p2sh({
                redeem: {
                    input: bitcoinjs_lib.script.compile([
                        signature,
                        bobPublicKey,
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

    // Extract the final transaction in hexadecimal format.
    const finalTransaction = psbt.extractTransaction().toHex();
    console.log(`Final transaction: ${finalTransaction}`);
    return finalTransaction;
}

// Function to broadcast the finalized transaction to the network.
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
    const isRedeem = process.argv[2] === 'alice';

    try {
        const finalTransactionHex = await prepareCounterPartyTransaction(isRedeem);
        await broadcastTransaction(finalTransactionHex);
    } catch (error) {
        console.error('Error while preparing or broadcasting transaction:', error);
    }
})();


