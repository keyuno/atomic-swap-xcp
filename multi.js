// Import required libraries and modules
const axios = require('axios');
const bitcoinjs_lib = require('bitcoinjs-lib');
const ECPairFactory = require('ecpair').ECPairFactory;
const tinysecp = require('tiny-secp256k1');
const bip68 = require('bip68');

// Set the Bitcoin testnet network
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

// Encode sequence for relative locktime
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

// Create Pay-to-Script-Hash (P2SH) address for the locking script
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
  const sharedAddress = p2sh.address;
  console.log(`Shared Address: ${sharedAddress}`);
  process.exit(0);
}

// Function to create an unsigned transaction
async function createUnsignedTransaction(source, destination, pubkey, flags) {
  const url = 'https://public.coindaddy.io:14001/api/';
  const auth = {
    username: 'rpc',
    password: '1234'
  };
  const headers = {
    'Content-Type': 'application/json'
  };


// Manually select encoding
const usePubkeyhash = false;  // set to true for pubkeyhash encoding
const useMultisig = true;   // set to true for multisig encoding

// The public key to receive dust
const dustReturnPubkey = pubkey;

// Default options for the transaction
var DEFAULT_OPTIONS = {
  allow_unconfirmed_inputs: true
};

if (usePubkeyhash) {
  DEFAULT_OPTIONS['encoding'] = 'pubkeyhash';
} else if (useMultisig) {
  DEFAULT_OPTIONS['encoding'] = 'multisig';
  DEFAULT_OPTIONS['dust_return_pubkey'] = dustReturnPubkey;
}

  const payload = {
    method: 'create_sweep',
    params: {
      source,
      destination,
      pubkey,
      flags: flags,
      ...DEFAULT_OPTIONS
    },
    jsonrpc: '2.0',
    id: 1
  };

  // Send the request to the API to create the unsigned transaction
  try {
    const response = await axios.post(url, payload, {
      headers,
      auth
    });

    console.log('Server response:', response.status, response.statusText);
    console.log('Response data:', response.data);

    const {
      data
    } = response;
    if (!data || !data.result || data.error) {
      throw new Error(`Invalid server response. Error message: ${data.error.message}`);
    }
    return data.result;
  } catch (error) {
    console.error('Failed to create unsigned transaction:', error.message);
    if (error.response) {
      console.error('Server response:', error.response.status, error.response.statusText);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

// Function to prepare the counterparty transaction
async function prepareCounterPartyTransaction(isRedeem) {
  const source = p2sh.address;
  const destination = '...'; // Enter destination address.
  const pubkey = (isRedeem ? alicePublicKey : bobPublicKey).toString('hex');
  const flags = 1 | 2;

  // Call the function to create the unsigned transaction
  let unsignedTxData = null;
  try {
    unsignedTxData = await createUnsignedTransaction(source, destination, pubkey, flags);
  } catch (error) {
    console.error('Error:', error);
    return;
  }

  // Convert the unsigned transaction data into a Transaction object
  const tx = bitcoinjs_lib.Transaction.fromHex(unsignedTxData);

  // Create a Partially Signed Bitcoin Transaction (PSBT) object
  const psbt = new bitcoinjs_lib.Psbt({
    network
  });

  // Function to get UTXO data from an address using the Blockstream API
  async function getUTXODataFromAddress(source) {
    const url = `https://blockstream.info/testnet/api/address/${source}/utxo`;

    // Send the request to the Blockstream API to get UTXO data
    try {
      const response = await axios.get(url);
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const utxo = response.data[0];
        const txid = utxo.txid;
        const vout = utxo.vout;
        const value = utxo.value;

        // Fetch the full transaction data for the selected UTXO
        const fullTxResponse = await axios.get(`https://blockstream.info/testnet/api/tx/${txid}/hex`);
        const fullTransaction = fullTxResponse.data;

        // Return the relevant data for the UTXO
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

  // Function to add inputs to the PSBT
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

  // Function to add outputs to the PSBT
  function addOutputs(psbt, tx) {
    tx.outs.forEach((output) => {
      psbt.addOutput({
        script: output.script,
        value: output.value
      });
    });
  }

  // Get UTXO data for the source address and add inputs to the PSBT
  const data = await getUTXODataFromAddress(source);
  addInputs(psbt, data, isRedeem);

  // Add outputs to the PSBT
  addOutputs(psbt, tx);

  // Sign the inputs in the PSBT using the appropriate private key (Alice or Bob)
  tx.ins.forEach((_, idx) => {
    const keyPair = isRedeem ? alice : bob;
    psbt.signInput(idx, keyPair);
  });

  // Finalize the PSBT and extract the final transaction in hexadecimal format
  if (isRedeem) {
    // For the redeem case, add the finalScriptSig to the PSBT
    const finalizeInput = (inputIndex) => {
      const input = psbt.data.inputs[inputIndex];
      const signature = input.partialSig[0].signature;
      const redeemPayment = bitcoinjs_lib.payments.p2sh({
        redeem: {
          input: bitcoinjs_lib.script.compile([
            signature,
            alicePublicKey,
            bitcoinjs_lib.opcodes.OP_TRUE
          ]),
          output: lockingScript
        }
      });

      return {
        finalScriptSig: redeemPayment.input
      };
    };

    // Finalize the PSBT input for the redeem case
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
            bitcoinjs_lib.opcodes.OP_FALSE
          ]),
          output: lockingScript
        }
      });

      return {
        finalScriptSig: redeemPayment.input
      };
    };

    // Finalize the PSBT input for the refund case
    psbt.finalizeInput(0, finalizeInput);
  }

  // Extract the final transaction from the PSBT and convert it to hexadecimal format
  const finalTransaction = psbt.extractTransaction().toHex();

  // Print the final transaction in hexadecimal format
  console.log(`Final transaction: ${finalTransaction}`);

  // Return the final transaction in hexadecimal format
  return finalTransaction;
}

// Function to broadcast the finalized transaction
async function broadcastTransaction(finalTransaction) {
  const url = 'https://blockstream.info/testnet/api/tx';
  const headers = {
    'Content-Type': 'text/plain'
  };

  try {
    // Broadcast the transaction using a POST request
    const response = await axios.post(url, finalTransaction, {
      headers
    });
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