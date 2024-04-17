const core = require('@actions/core');
const github = require('@actions/github');
const {
  deleteAuthenticatedUserContainerVersion,
  deleteOrgContainerVersion,
  deleteUserContainerVersion,
  listAuthenticatedUserContainerVersions,
  listOrgContainerVersions,
  listUserContainerVersions,
} = require('./src/octokit');
const {getMultiPlatPruningList, getPruningList, prune} = require('./src/pruning');
const {versionFilter} = require('./src/version-filter');
const {getManifest, createDockerAPIClient, dockerAPIGet} = require('./src/docker-api.js')

const asBoolean = (v) => 'true' == String(v);

const versionSummary = (version) => JSON.stringify({
  id: version.id,
  name: version.name,
  created_at: version.created_at,
  tags: version.metadata.container.tags,
});

const dryRunDelete = (version) => new Promise((resolve) => {
  core.info(`Dry-run pruning of: ${versionSummary(version)}`);
  resolve();
});

const writeSummary = async (container, dryRun, pruningVersions, prunedVersions) => {
  const allPruned = pruningVersions.length === prunedVersions.length;

  let summary = core.summary.addHeading(`Pruning versions for container: ${container}`, 2);

  if (dryRun) {
    summary = summary.addRaw(':warning: This is a dry run, no container versions were actually deleted.');
  } else {
    summary = summary.addRaw(`${allPruned ? ':white_check_mark:' : ':x:'} ${prunedVersions.length} out of ${pruningVersions.length} identified versions were pruned successfully.`);
  }

  await summary.addHeading('Pruned versions', 3)
               .addRaw(`The following ${prunedVersions.length} versions were successfully pruned:`)
               .addTable([
                  [{data: 'ID', header: true}, {data: 'Name', header: true}, {data: 'Created at', header: true}, {data: 'Tags', header: true}],
                  ...prunedVersions.map((version) => ([
                    String(version.id),
                    version.name,
                    version.created_at.replace('T', ' '),
                    version.metadata.container.tags.join(', '),
                  ])),
                ])
                .write();
};

const run = async () => {
  try {
    const token = core.getInput('token');
    const organization = core.getInput('organization');
    const user = core.getInput('user');

    if (organization && user) {
      core.setFailed('Inputs `organization` and `user` are mutually exclusive and must not both be provided in the same run.');
      return;
    }

    const container = core.getInput('container');

    const pruneMultiPlatform = asBoolean(core.getInput('prune-multi-platform'));

    const dryRun = asBoolean(core.getInput('dry-run'));

    const keepLast = Number(core.getInput('keep-last'));

    // For backward compatibility of deprecated input `tag-regex`
    const legacyTagRegex = core.getInput('tag-regex') ? [core.getInput('tag-regex')] : null;

    const pruneUntagged = asBoolean(core.getInput('prune-untagged')) || asBoolean(core.getInput('untagged'))

    if (pruneMultiPlatform && pruneUntagged) {
      core.setFailed('Inputs `prune-multi-platform` and `prune-untagged` are mutually exclusive and must not both be provided in the same run.');
      return;
    }

    /* This can possibly be improved. We need this info for multi-platform due
       to the docker registry api, but we might be able to autodetect this from
       the authenticated user */
    if (pruneMultiPlatform && !(organization || user)) {
      core.setFailed('Inputs `prune-multi-platform` requires either `organization` or `user` to defined');
      return;
    }

    const filterOptions = {
      keepTags: core.getMultilineInput('keep-tags'),
      keepTagsRegexes: core.getMultilineInput('keep-tags-regexes'),
      keepYoungerThan: Number(core.getInput('keep-younger-than')) || Number(core.getInput('older-than')),
      pruneTagsRegexes: core.getInput('prune-tags-regexes') ? core.getMultilineInput('prune-tags-regexes') : legacyTagRegex,
      pruneUntagged: pruneUntagged,
    };

    const octokit = github.getOctokit(token);

    let listVersions;
    let pruneVersion;
    let owner;
    if (user) {
      listVersions = listUserContainerVersions(octokit)(user, container);
      pruneVersion = dryRun ? dryRunDelete : deleteUserContainerVersion(octokit)(user, container);
      owner = user;
    } else if (organization) {
      listVersions = listOrgContainerVersions(octokit)(organization, container);
      pruneVersion = dryRun ? dryRunDelete : deleteOrgContainerVersion(octokit)(organization, container);
      owner = organization;
    } else {
      listVersions = listAuthenticatedUserContainerVersions(octokit)(container);
      pruneVersion = dryRun ? dryRunDelete : deleteAuthenticatedUserContainerVersion(octokit)(container);
    }
    const filterVersion = versionFilter(filterOptions);

    const pruningList = await getPruningList(listVersions, filterVersion)(keepLast);

    if (pruneMultiPlatform) {
      const dockerAPIClient = createDockerAPIClient();
      const dockerAPIGetCmd = dockerAPIGet(dockerAPIClient, token, owner, container);
      const getManifestByTag = getManifest(dockerAPIGetCmd);

      const multiPlatPruningList = await getMultiPlatPruningList(listVersions, getManifestByTag)(pruningList);
      if (multiPlatPruningList) {
        pruningList.push(...multiPlatPruningList);
      }
    } else if (pruneUntagged) {
      console.log("made it into custom else if conditional")
      // ~~1. Get all the tags that are tagged~~
      const dockerAPIClient = createDockerAPIClient();

      console.log(listVersions)

      // 2. Go through each tagged image to determine if it's multi-arch by getting its manifest
      const digests = {};
      for (const tag of listVersions) {
        console.log("tag "+tag+" is multi-arch?")
        const dockerAPIGetCmd = dockerAPIGet(dockerAPIClient, token, owner, tag);
        const manifest = getManifest(dockerAPIGetCmd);

        if (manifest.mediaType === 'application/vnd.oci.image.index.v1+json') {
          // This is a multi-arch image, add all the digests from the manifests to the digests object
          console.log("  true")
          for (const manifest of manifest.manifests) {
            digests[manifest.digest] = true;
          }
        } else {
          console.log("  false")
        }
      }

      console.log(digests)

      // 4. Do not prune an image if it is in the digests object
      for (const image of pruningList) {
        if (!digests[image.digest]) {
          let index = pruningList.indexOf(item);
            if (index !== -1) {
              pruningList.splice(index, 1);
            }
        }
      }
    }

    core.info(`Found a total of ${pruningList.length} versions to prune`);

    const prunedList = await prune(pruneVersion)(pruningList);

    await writeSummary(container, dryRun, pruningList, prunedList);

    if (prunedList.length !== pruningList.length) {
      core.setFailed(`Failed to prune some versions: ${prunedList.length} out of ${pruningList.length} versions were pruned`);
    }

    core.setOutput('count', prunedList.length);
    core.setOutput('prunedVersionIds', prunedList.map((version) => version.id));
    core.setOutput('dryRun', dryRun);
  } catch (error) {
    core.setFailed(error.message);
  }
};

run();
