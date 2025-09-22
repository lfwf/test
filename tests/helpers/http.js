async function postJson(url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  return response;
}

async function putJson(url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });
  return response;
}

async function getJson(url, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, {
    method: 'GET',
    headers
  });
  return response;
}

module.exports = {
  postJson,
  putJson,
  getJson
};
