// Адрес веб-приложения Google Apps Script (заканчивается на /exec).
// Таблица: https://docs.google.com/spreadsheets/d/1qhKF8rFVevoXluHJh0aYbVco7sJoDsOPsw9fmzDz4DI
window.API_URL = 'https://script.google.com/macros/s/AKfycbyyxyE6bE8G_7LdwL1DFi2FlTFpUwMv3iKB5Z1xM_sFwd5sEKLdU9WgnBBe7qGkIitPgw/exec';

// Общая функция обращения к серверу
window.callApi = async function (action, data) {
  if (!/^https:\/\/script\.google\.com\//.test(window.API_URL)) throw new Error('Программа ещё не подключена к Google Таблице (config.js).');
  let r;
  try {
    r = await fetch(window.API_URL, { method: 'POST', body: JSON.stringify(Object.assign({ action }, data || {})) });
  } catch (e) { throw new Error('Нет связи с сервером. Проверьте интернет.'); }
  const res = await r.json().catch(() => ({ error: 'Ошибка ответа сервера' }));
  if (res && res.error) { const err = new Error(res.error); err.code = res.code; throw err; }
  return res;
};
