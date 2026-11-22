// Камера и распознавание лица (face-api, работает прямо в браузере телефона).
// FaceCam.capture(title) открывает камеру и возвращает { descriptor: number[128], photo: 'data:image/jpeg;base64,...' }

(function () {
  const LIB = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/dist/face-api.js';
  const MODELS = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/model/';
  let ready = null;

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Не удалось загрузить модуль распознавания. Проверьте интернет.'));
      document.head.appendChild(s);
    });
  }

  // Загружаем библиотеку и модели один раз (≈ 7 МБ, потом берутся из кэша браузера)
  function preload() {
    if (!ready) {
      ready = (async () => {
        if (!window.faceapi) await loadScript(LIB);
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODELS);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODELS);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODELS);
      })();
      ready.catch(() => { ready = null; });
    }
    return ready;
  }

  const css = `
  .fc-back{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px}
  .fc-box{background:#fff;border-radius:16px;max-width:420px;width:100%;padding:16px;text-align:center;font-family:inherit;color:#1d1d1b}
  .fc-title{font-weight:600;font-size:17px;margin:0 0 10px}
  .fc-wrap{position:relative;border-radius:12px;overflow:hidden;background:#111;aspect-ratio:3/4}
  .fc-wrap video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
  .fc-oval{position:absolute;left:18%;right:18%;top:12%;bottom:18%;border:3px dashed rgba(255,255,255,.75);border-radius:50%}
  .fc-hint{font-size:14px;color:#6b6a63;margin:10px 0}
  .fc-hint.err{color:#b23a2e}
  .fc-btns{display:flex;gap:8px}
  .fc-btns button{flex:1;border:0;border-radius:10px;padding:14px;font-size:17px;font-weight:600;cursor:pointer}
  .fc-shot{background:#1f3b2d;color:#fff} .fc-shot:disabled{opacity:.5}
  .fc-cancel{background:#efece4;color:#1d1d1b}`;

  function capture(title) {
    return new Promise((resolve, reject) => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return reject(new Error('Камера недоступна в этом браузере'));
      if (!document.getElementById('fc-style')) { const st = document.createElement('style'); st.id = 'fc-style'; st.textContent = css; document.head.appendChild(st); }

      const back = document.createElement('div');
      back.className = 'fc-back';
      back.innerHTML = `<div class="fc-box"><p class="fc-title"></p>
        <div class="fc-wrap"><video playsinline muted autoplay></video><div class="fc-oval"></div></div>
        <p class="fc-hint">Загрузка камеры…</p>
        <div class="fc-btns"><button class="fc-cancel">Отмена</button><button class="fc-shot" disabled>📸 Снять</button></div></div>`;
      back.querySelector('.fc-title').textContent = title || 'Селфи для подтверждения';
      document.body.appendChild(back);
      const video = back.querySelector('video'), hint = back.querySelector('.fc-hint'), shot = back.querySelector('.fc-shot');
      let stream = null, done = false;

      const close = () => { if (stream) stream.getTracks().forEach(t => t.stop()); back.remove(); };
      const fail = e => { if (done) return; done = true; close(); reject(e); };
      back.querySelector('.fc-cancel').onclick = () => fail(new Error('Отменено'));

      const setHint = (t, err) => { hint.textContent = t; hint.className = 'fc-hint' + (err ? ' err' : ''); };

      (async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
          video.srcObject = stream;
          await video.play().catch(() => {});
        } catch (e) {
          return fail(new Error('Нет доступа к камере. Разрешите камеру для этого сайта в настройках браузера.'));
        }
        setHint('Загрузка распознавания лица…');
        try { await preload(); } catch (e) { return fail(e); }
        setHint('Поместите лицо в овал и нажмите «Снять»');
        shot.disabled = false;
      })();

      shot.onclick = async () => {
        shot.disabled = true; setHint('Проверяем лицо…');
        try {
          const w = video.videoWidth, h = video.videoHeight;
          if (!w) throw new Error('Камера ещё не готова');
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(video, 0, 0, w, h);
          const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
          const found = await faceapi.detectAllFaces(c, opts).withFaceLandmarks().withFaceDescriptors();
          if (found.length === 0) throw new Error('Лицо не найдено. Подойдите ближе к свету и смотрите в камеру.');
          if (found.length > 1) throw new Error('В кадре несколько лиц. Нужен только один человек.');
          const box = found[0].detection.box;
          if (box.width < w * 0.2) throw new Error('Лицо слишком далеко. Поднесите телефон ближе.');

          // уменьшенное фото для хранения
          const scale = Math.min(1, 480 / Math.max(w, h));
          const p = document.createElement('canvas'); p.width = Math.round(w * scale); p.height = Math.round(h * scale);
          p.getContext('2d').drawImage(c, 0, 0, p.width, p.height);
          const photo = p.toDataURL('image/jpeg', 0.7);

          done = true; close();
          resolve({ descriptor: Array.from(found[0].descriptor), photo });
        } catch (e) {
          setHint(e.message, true); shot.disabled = false;
        }
      };
    });
  }

  window.FaceCam = { preload, capture };
})();
