
const http = require('@actions/http-client');
const { execSync } = require('child_process');

const createDockerAPIClient = () => {
  const client = new http.HttpClient('github-action');

  return client;
}

const getDockerAuthToken = (token, owner, container) => {
  const command = `curl -u github:${token} -s "https://ghcr.io/token?service=ghcr.io&scope=repository%3A${owner}/${container}" | sed -n 's|.*"token":"\\([^"]*\\)".*|\\1|p'`;
  let authToken;
  try {
    authToken = execSync(command).toString().trim();
  } catch (error) {
    console.log(`Failed to get Docker auth token: ${error.message}`);
    throw error;
  }

  return authToken;
};

const dockerAPIGet = (client, token, owner, container) => async (resource) => {
  const dockerToken = getDockerAuthToken(token, owner, container);

  const headers = {
    Accept: `application/vnd.oci.image.index.v1+json`,
    Authorization: `Bearer ${dockerToken}`,
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
