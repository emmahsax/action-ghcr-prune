
const http = require('@actions/http-client');
const core = require('@actions/core');
const { Buffer } = require('buffer');

const createDockerAPIClient = () => {
  const client = new http.HttpClient('github-action');

  return client;
}

const dockerAPIGet = (client, token, owner, container) => async (resource) => {
  const headers = {
    Authorization: `Bearer ${token}`
  };

  console.log("headers:"+headers);

  const url = `https://ghcr.io/v2/${owner}/${container}/${resource}`;

  const response = await client.get(url, { headers });

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
