const fetch = require('node-fetch')
const ms = require('ms')
const repos = require('./repos.json')

// Create keys
let data = Object.assign([], repos)

module.exports = async (req, res) => {
	res.setHeader('Access-Control-Allow-Origin', '*')
	res.setHeader('Access-Control-Allow-Methods', 'GET')
	return data
}

const interval = process.env.TIME_INTERVAL || '30m'

// Cache data now and every X ms
cacheData()
setInterval(cacheData, ms(interval))

const log = (text) => {
	return slack(text, process.env.TOKEN_EVENTS)
}

const logError = (text) => {
	return slack(text, process.env.TOKEN_ALERTS)
}

const pm = (text) => {
	return slack(text, process.env.TOKEN_PM)
}

const slack = (text, id) => {
	fetch(`https://hooks.slack.com/services/${id}`, {
		method: 'POST',
		body: JSON.stringify({text})
	})
}


async function fetchData(key, repo, logs) {

	const start = Date.now()

	const arrayRepo = repo.split("/")
	const owner = arrayRepo[0]
	const name = arrayRepo[1]
	const query = `
	{
	  repository(owner: "${owner}", name: "${name}") {
	    refs(refPrefix: "refs/tags/", last: 1, orderBy: {field: TAG_COMMIT_DATE, direction: ASC}) {
	      nodes {
	        name
	      }
	      edges {
	        node {
	          name
	          target {
	            ... on Commit {
	              message
	            }
	          }
	        }
	      }
	    }
	  }
	}
	`

	let res = await fetch('https://api.github.com/graphql',{
		method: 'POST',
		headers: {
			'Content-Type': 'application/graphql',
			'Authorization': `Bearer ${process.env.TOKEN_GITHUB}`
		},
		body: JSON.stringify({query})
	})



	if (res.status !== 200) {
		logs.error = logs.error + '\n'+ `Non-200 response code from GitHub *_${repo}_*: ${res.status}`
		return
	}

	try {
		let data_ = await res.json()
		if (!data_) {
		  return
		}

		let tagPrev = data[key].tag

		const tagName = data_.data.repository.refs.edges[0].node.name
		const nodeTarget = data_.data.repository.refs.edges[0].node.target
		data[key] = {
		  tag: tagName,
		  url: `https://github.com/${repo}/releases/tag/${tagName}`,
		  message: nodeTarget.message ? nodeTarget.message : ''
		}

		logs.log =  logs.log + '\n' + `Re-built now releases cache. *_${repo}_* ` +
							`Elapsed: ${(new Date() - start)}ms`

		if(tagPrev != data[key].tag && tagPrev != undefined){
			pm(`*_${repo}_*: ${data[key].tag} \n ${data[key].message} \n New Release: ${data[key].url}`)
		}
	}
	catch(err){
		logError(`Error parsing response from GitHub *_${repo}_*: ` + err.stack)
	}
			
}

async function cacheData() {

	const logs = {
		error: "",
		log: ""
	}

	for (let [key, repo] of repos.entries()){
		await fetchData(key, repo, logs)
	}

	if(logs.error != "") console.error("\x1b[31m", logs.error)

}
