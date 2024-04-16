
const http = require('@actions/http-client');
const { Buffer } = require('buffer');

const createDockerAPIClient = () => {
  const client = new http.HttpClient('github-action');

  return client;
}

const dockerAPIGet = (client, token, owner, container) => async (resource) => {
  const base64Token = Buffer.from(token).toString('base64');
  const headers = {
    Authorization: `Bearer ${base64Token}`
  };

  console.log("headers:"+headers);
  console.log("token:"+base64Token);

  const url = `https://ghcr.io/v2/${owner}/${container}/${resource}`;

  const response = await client.get(url, headers);

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
