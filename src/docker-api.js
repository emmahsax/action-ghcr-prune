
const http = require('@actions/http-client');
const core = require('@actions/core');
const { Buffer } = require('buffer');

const createDockerAPIClient = () => {
  const client = new http.HttpClient('github-action');

  return client;
}

// const dockerAPIGet = (client, token, owner, container) => async (resource) => {
//   const headers = {
//     Authorization: `Bearer ${token}`
//   };

//   const url = `https://ghcr.io/v2/${owner}/${container}/${resource}`;

//   const response = await client.get(url, { headers });

//   if (response.message.statusCode != 200) {
//     throw new Error(`Docker API request at ${url} was not successful. Status code: ${response.message.statusCode}, Status message: ${response.message.statusMessage}`);
//   }

//   return response;
// }

const dockerAPIGet = async (client, token, owner, container, resource) => {
  // First, make an anonymous request to get the Www-Authenticate header
  let response = await client.get(`https://ghcr.io/v2/${owner}/${container}/${resource}`);
  const authenticateHeader = response.headers['www-authenticate'];

  // Parse the Www-Authenticate header to get the realm, service, and scope
  const match = /Bearer realm="(.*?)",service="(.*?)",scope="(.*?)"/.exec(authenticateHeader);
  const [, realm, service, scope] = match;

  // Use the realm, service, and scope to get a token
  response = await client.get(`${realm}?service=${service}&scope=${scope}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const { token: dockerToken } = await response.json();

  // Use the token to make the authenticated request
  response = await client.get(`https://ghcr.io/v2/${owner}/${container}/${resource}`, {
    headers: {
      Authorization: `Bearer ${dockerToken}`
    }
  });

  if (response.message.statusCode != 200) {
    throw new Error(`Docker API request at ${url} was not successful. Status code: ${response.message.statusCode}, Status message: ${response.message.statusMessage}`);
  }

  return response;
}

const getManifest = (getCmd) => async (tag) => {
  const response = await getCmd(`manifests/${tag}`);

  const responseBody = await response.readBody();

  const manifest = JSON.parse(responseBody);

  return manifest;
}

module.exports = {
  getManifest,
  createDockerAPIClient,
  dockerAPIGet,
}
