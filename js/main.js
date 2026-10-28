import { genKeyPair, b64, unb64, validPrefix } from './engine.js';

const $ = id => document.getElementById(id);

// ---------- Tab ----------
const tabs = [
  { btn: $('tabSingle'), panel: $('singlePanel') },
  { btn: $('tabVanity'), panel: $('vanityPanel') },
];
tabs.forEach(t => t.btn.onclick = () => {
  tabs.forEach(x => {
    x.btn.classList.toggle('on', x === t);
    x.panel.classList.toggle('hidden', x !== t);
  });
});

// ---------- 单生成 ----------
let cur = null;
$('genOne').onclick = async () => {
  $('genOne').disabled = true;
  $('st1').innerHTML = '<span class="spin"></span>生成中…';
  try {
    const { sk, pk, body } = await genKeyPair();
    cur = { addr: body + '.onion', sk: b64(sk), pk: b64(pk) };
    $('rAddr').textContent = cur.addr;
    $('rPub').textContent = cur.pk;
    $('rSec').textContent = cur.sk;
    $('resultPanel').classList.remove('hidden');
    $('st1').textContent = '完成';
  } catch (e) { $('st1').textContent = '失败：' + e.message; }
  $('genOne').disabled = false;
};

// ---------- 显示/复制/下载/清空 ----------
document.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => {
  const el = $(b.dataset.toggle);
  el.classList.toggle('on');
  b.textContent = el.classList.contains('on') ? '隐藏' : '显示';
});
document.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => {
  navigator.clipboard.writeText($(b.dataset.copy).textContent);
  b.textContent = '已复制'; setTimeout(() => b.textContent = '复制', 1200);
});
document.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => {
  if (!cur) return;
  const name = b.dataset.dl;
  let content;
  if (name === 'hostname') content = cur.addr + '\n';
  else if (name === 'hs_ed25519_public_key')
    content = '== ed25519v1-public: type0 ==\x00' + String.fromCharCode(...unb64(cur.pk));
  else content = '== ed25519v1-secret: type0 ==\x00' + String.fromCharCode(...unb64(cur.sk));

  const blob = new Blob([content], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  a.click(); URL.revokeObjectURL(a.href);
});
$('clearAll').onclick = () => {
  cur = null;
  ['rAddr', 'rPub', 'rSec'].forEach(id => $(id).textContent = '');
  $('rSec').classList.remove('on');
  $('resultPanel').classList.add('hidden');
};

// ---------- 虚荣 / 批量 ----------
const prefixIn = $('prefix');
prefixIn.oninput = () => {
  const v = prefixIn.value.toLowerCase().replace(/[^a-z2-7]/g, '').slice(0, 5);
  if (v !== prefixIn.value) prefixIn.value = v;
  if (v.length >= 5) $('st2').textContent = '⚠ 5 位及以上可能需要数小时，建议随时停止。';
  else $('st2').textContent = '';
};

const N = Math.min(navigator.hardwareConcurrency || 2, 8);
let workers = [], totalHits = 0, speedSum = 0, wantCount = 0;

function stopAll() {
  workers.forEach(w => { w.postMessage({ type: 'stop' }); w.terminate(); });
  workers = [];
  $('genVanity').disabled = false;
  $('stopVanity').disabled = true;
}

function addRow(hit) {
  const tbody = $('vanityTable').querySelector('tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `<td class="addr">${hit.address}</td>
    <td><span class="val sec" style="display:inline-block;padding:4px 8px;font-size:12px">${hit.secretKeyB64}</span></td>
    <td><button class="sec" data-hit-dl>下载</button></td>`;
  tr.querySelector('.val').onclick = e => e.target.classList.toggle('on');
  tr.querySelector('[data-hit-dl]').onclick = () => {
    const files = {
      hostname: hit.address + '\n',
      hs_ed25519_public_key: '== ed25519v1-public: type0 ==\x00' + String.fromCharCode(...unb64(hit.publicKeyB64)),
      hs_ed25519_secret_key: '== ed25519v1-secret: type0 ==\x00' + String.fromCharCode(...unb64(hit.secretKeyB64)),
    };
    Object.entries(files).forEach(([name, c]) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([c])); a.download = name; a.click();
      URL.revokeObjectURL(a.href);
    });
  };
  tbody.appendChild(tr);
  $('vanityTable').classList.remove('hidden');
}

$('genVanity').onclick = () => {
  const prefix = prefixIn.value.trim();
  const want = parseInt($('target').value, 10) || 1;
  if (!validPrefix(prefix)) return alert('前缀只能包含 a-z 和 2-7');
  if (!prefix) return alert('请输入前缀');

  $('vanityTable').querySelector('tbody').innerHTML = '';
  $('vanityTable').classList.add('hidden');
  totalHits = 0; speedSum = 0; wantCount = want;
  $('genVanity').disabled = true;
  $('stopVanity').disabled = false;

  // 每个 Worker 目标 = 总数 ÷ Worker 数（向上取整）
  const per = Math.ceil(want / N);
  workers = Array.from({ length: N }, () => new Worker('./js/worker.js', { type: 'module' }));

  workers.forEach(w => {
    w.onmessage = ({ data: msg }) => {
      if (msg.type === 'hit') {
        totalHits++;
        addRow(msg);
        if (totalHits >= wantCount) { stopAll(); $('st2').textContent = `完成，共生成 ${totalHits} 个匹配。`; }
      } else if (msg.type === 'speed') {
        speedSum = (speedSum + msg.speed) / 2;
        if (totalHits < wantCount)
          $('st2').textContent = `目标 ${wantCount}，已完成 ${totalHits}，速度约 ${Math.round(speedSum)} 次/秒`;
      }
    };
    w.postMessage({ type: 'start', prefix, target: per });
  });
};
$('stopVanity').onclick = () => { stopAll(); $('st2').textContent = `已停止，共完成 ${totalHits} 个。`; };