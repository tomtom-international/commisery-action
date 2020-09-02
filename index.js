const core = require('@actions/core')
const exec = require('@actions/exec')
const github = require('@actions/github')

function  CommitMessageError(message) {
  return new Error(message.replace(/\x1B[[(?);]{0,2}(;?\d)*./g, ''))
}

async function commisery(commit) {
  let stderr = ''

  await exec.exec('commisery-verify-msg', [commit.sha], {
    listeners: {
      stdout: (data) => { process.stdout.write(data) },
      stderr: (data) => { stderr += data.toString() }
    }
  }).catch((err) => {
    // Intentionally do nothing..
  })

  return stderr
}

async function run() {
  const token = core.getInput('token')
  const pr = core.getInput('pull-request-id')
  const octokit = github.getOctokit(token)

  const repo = process.env.GITHUB_REPOSITORY.split('/')

  const { data: commits } = await octokit.pulls.listCommits({
    owner: repo[0],
    repo: repo[1],
    pull_number: pr,
  })

  let err = ''
  const tasks = commits.map(commisery)
  const results = await Promise.all(tasks)
  results.forEach(x => err += x)

  if (err != '') {
    throw new CommitMessageError(err)
  }
}

run().then(() => {
  process.exit(0);
}).catch((e) => {
  core.setFailed(e.message)
})