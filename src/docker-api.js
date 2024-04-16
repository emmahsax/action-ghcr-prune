
const http = require('@actions/http-client');
const fs = require('fs');
const os = require('os');

const createDockerAPIClient = () => {
  const client = new http.HttpClient('github-action');

  return client;
}

const getDockerAuthToken = () => {
  const dockerConfigPath = `${os.homedir()}/.docker/config.json`;
  const dockerConfig = JSON.parse(fs.readFileSync(dockerConfigPath));
  const auths = dockerConfig.auths;
  const ghcrAuth = auths['ghcr.io'];
  const authToken = ghcrAuth.auth;

  return authToken;
};

const dockerAPIGet = (client, owner, container) => async (resource) => {
  const token = getDockerAuthToken();

  console.log(`Docker API token: ${token}`)

  const headers = {
    Accept: `application/vnd.oci.image.index.v1+json`,
    Authorization: `Bearer ${token}`,
  };

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
