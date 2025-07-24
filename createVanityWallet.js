process.removeAllListeners('warning'); // Tắt cảnh báo DeprecationWarning

const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const fs = require('fs');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const readline = require('readline');
const os = require('os');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function createVanityWallet(prefix, suffix, caseSensitive) {
  let keypair, publicKey, attempts = 0;
  while (true) {
    keypair = Keypair.generate();
    publicKey = keypair.publicKey.toString();
    attempts++;
    let pk = caseSensitive ? publicKey : publicKey.toLowerCase();
    let pre = caseSensitive ? prefix : prefix.toLowerCase();
    let suf = caseSensitive ? suffix : suffix.toLowerCase();
    if ((!prefix || pk.startsWith(pre)) && (!suffix || pk.endsWith(suf))) break;
  }
  return { secretKey: Array.from(keypair.secretKey), publicKey, attempts };
}

if (!isMainThread) {
  const { prefix, suffix, caseSensitive } = workerData;
  const result = createVanityWallet(prefix, suffix, caseSensitive);
  parentPort.postMessage(result);
}

if (isMainThread) {
  rl.question('Nhập tên ví (ví dụ: MyWallet): ', (walletName) => {
    rl.question('Nhập chuỗi BẮT ĐẦU (Enter nếu không quan tâm): ', (prefix) => {
      rl.question('Nhập chuỗi KẾT THÚC (Enter nếu không quan tâm): ', (suffix) => {
        rl.question('Phân biệt chữ HOA/thường không? (y/n): ', (caseSensitiveInput) => {
          const caseSensitive = caseSensitiveInput.trim().toLowerCase() === 'y';
          rl.question(`Số luồng sử dụng (tối đa ${os.cpus().length}): `, (inputThreads) => {
            rl.close();
            const numWorkers = Math.max(1, Math.min(parseInt(inputThreads), os.cpus().length) || 1);
            const validBase58 = /^[1-9A-HJ-NP-Za-km-z]*$/;
            if ((prefix && !validBase58.test(prefix)) || (suffix && !validBase58.test(suffix))) {
              console.error('❌ Chuỗi phải là ký tự Base58 (1-9, A-H, J-N, P-Z, a-k, m-z)');
              process.exit(1);
            }

            console.log(`🔍 Tìm ví bắt đầu "${prefix}" kết thúc "${suffix}" với ${numWorkers} luồng...`);
            console.log('🚀 Bot đã bắt đầu tìm ví... Vui lòng chờ.');
            const startTime = Date.now();
            let totalAttempts = 0;
            let found = false;
            const workers = [];

            for (let i = 0; i < numWorkers; i++) {
              const worker = new Worker(__filename, { workerData: { prefix, suffix, caseSensitive } });

              worker.on('message', (result) => {
                if (found) return;
                found = true;
                const { secretKey, publicKey, attempts } = result;
                totalAttempts += attempts;
                const privateKey = bs58.encode(Buffer.from(secretKey));
                const timeElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
                const fileName = `${walletName || 'MySolanaWallet'}_wallet.json`;
                fs.writeFileSync(fileName, JSON.stringify({
                  name: walletName || 'MySolanaWallet',
                  publicKey, privateKey,
                  attempts: totalAttempts,
                  timeElapsedSeconds: timeElapsed
                }, null, 2));
                console.log(`\n🎉 Đã tạo ví!`);
                console.log(`🔑 Public Key: ${publicKey}`);
                console.log(`🔐 Private Key: ${privateKey}`);
                console.log(`📊 Số lần thử: ${totalAttempts}`);
                console.log(`⏱️ Thời gian: ${timeElapsed} giây`);
                console.log(`💾 Lưu vào: ${fileName}`);
                workers.forEach(w => w.terminate());
              });

              worker.on('error', (err) => console.error(`Lỗi Worker: ${err}`));
              workers.push(worker);
            }

            process.on('SIGINT', () => {
              console.log('\n⛔ Dừng.');
              workers.forEach(w => w.terminate());
              process.exit(0);
            });
          });
        });
      });
    });
  });
}
