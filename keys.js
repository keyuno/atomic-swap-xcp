const {networks,payments} = require("bitcoinjs-lib");
const {ECPairFactory} = require("ecpair");
const tinysecp = require("tiny-secp256k1");
const ECPair = ECPairFactory(tinysecp);

const NETWORK = networks.testnet;

// Alice's details
const alicePrivateKey = ECPair.makeRandom({
    network: NETWORK
}).toWIF();
const alicebPublicKey = ECPair.fromWIF(alicePrivateKey, NETWORK).publicKey;
const aliceAddress = payments.p2pkh({
    pubkey: alicebPublicKey,
    network: NETWORK,
}).address;

console.log("Alice's Bitcoin address:", aliceAddress);
console.log("Alice's Bitcoin private key:", alicePrivateKey);
console.log("Alice's Bitcoin public key:", alicebPublicKey.toString("hex"));


// Bob's details
const bobPrivateKey = ECPair.makeRandom({
    network: NETWORK
}).toWIF();
const bobPublicKey = ECPair.fromWIF(bobPrivateKey, NETWORK).publicKey;
const bobAddress = payments.p2pkh({
    pubkey: bobPublicKey,
    network: NETWORK,
}).address;

console.log("Bob's Bitcoin address:", bobAddress);
console.log("Bob's Bitcoin private key:", bobPrivateKey);
console.log("Bob's Bitcoin public key:", bobPublicKey.toString("hex"));