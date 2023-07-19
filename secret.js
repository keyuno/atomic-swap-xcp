const axios = require('axios');

async function getSecretWordFromTransaction(txid) {
  try {
    const response = await axios.get(`https://blockstream.info/testnet/api/tx/${txid}`);
    const transaction = response.data;
    const scriptsig_asm = transaction.vin[0].scriptsig_asm;
    const scriptsigParts = scriptsig_asm.split(' ');

    // According to data structure the pre-image is the sixth element after splitting scriptsig_asm
    const preimage = scriptsigParts[5];  

    // Conversion from hex to utf-8
    const preimageStr = Buffer.from(preimage, 'hex').toString('utf8');  

    console.log(`The pre-image is: ${preimageStr}`);
    return preimageStr;

  } catch (err) {
    console.error(`Failed to fetch transaction: ${err}`);
  }
}

getSecretWordFromTransaction('...'); // Enter Transaction ID.

