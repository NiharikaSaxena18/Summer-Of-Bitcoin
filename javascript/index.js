import BitcoinCore from "bitcoin-core";
import fs from "fs";

// Node access params
const RPC_URL = {
    network: 'testnet',
    host: '127.0.0.1',
    port: 18443,
    username: 'alice',
    password: 'password',
};

const client = new BitcoinCore(RPC_URL);

async function send(client, addr, data) {
    try {
        // Create OP_RETURN data
        const message = "We are all Satoshi!!";
        const messageHex = Buffer.from(message, 'utf8').toString('hex');

        // Get unspent outputs
        const unspent = await client.listUnspent();
        if (!unspent || unspent.length === 0) {
            throw new Error("No unspent outputs available");
        }

        // Ensure total balance is calculated
        const totalAmount = unspent.reduce((sum, utxo) => sum + utxo.amount, 0);
        if (totalAmount < 100) {
            throw new Error("Insufficient funds. Available: ${totalAmount}, Required: 100");
        }

        // Select inputs to cover the payment
        const inputs = [];
        let inputAmount = 0;
        for (const utxo of unspent) {
            inputs.push({ txid: utxo.txid, vout: utxo.vout });
            inputAmount += utxo.amount;
            if (inputAmount >= 100) {
                break;
            }
        }

        // Create outputs
        const outputs = {
            [addr]: 100,  // Payment output
            data: messageHex,  // OP_RETURN output
        };

        // Create raw transaction
        const rawTx = await client.createRawTransaction(inputs, outputs);

        // Fund the transaction
        const fundOptions = { feeRate: 21, changePosition: 1 };
        const fundedTx = await client.fundRawTransaction(rawTx, fundOptions);

        // Sign the transaction
        const signedTx = await client.signRawTransactionWithWallet(fundedTx.hex);
        if (!signedTx.complete) {
            throw new Error("Transaction signing failed");
        }

        // Send the transaction
        const txid = await client.sendRawTransaction(signedTx.hex);

        // Decode the transaction for verification
        const decodedTx = await client.decodeRawTransaction(signedTx.hex);

        return txid;

    } catch (err) {
        console.error("Error during transaction:", err);
        throw err;
    }
}

async function main() {
    try {
        // Check connection
        const info = await client.getBlockchainInfo();
        console.log("Connected to Bitcoin node:", info.chain);

        // Create and load wallet
        const walletName = "testwallet";
        try {
            await client.createWallet(walletName);
        } catch (e) {
            if (e.message.includes('Wallet already exists')) {
                await client.loadWallet(walletName);
            }
        }

        // Generate a new address
        const address = await client.getNewAddress();
        console.log("Generated address: ${address}");

        // Mine 200 blocks to ensure enough funds (each block gives 50 BTC)
        await client.generateToAddress(200, address);
        console.log("Mined 200 blocks");

        // Get balance
        const balance = await client.getBalance();
        console.log("Wallet balance: ${balance} BTC");

        // Send transaction
        const recipientAddress = "bcrt1qq2yshcmzdlznnpxx258xswqlmqcxjs4dssfxt2";
        const txid = await send(client, recipientAddress, "We are all Satoshi!!");
        console.log("Transaction sent: ${txid}");

        // Write txid to out.txt
        fs.writeFileSync("out.txt", txid);

    } catch (err) {
        console.error("Error:", err);
    }
}

main();