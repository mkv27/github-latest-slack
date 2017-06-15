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

	let res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
			headers: {
			  Accept: 'application/vnd.github.preview'
			}
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

		data[key] = {
		  tag: data_.tag_name,
		  url: data_.html_url,
		  assets: data_.assets.map(({name, browser_download_url}) => ({
		    name,
		    url: browser_download_url
		  }))
		}

		logs.log =  logs.log + '\n' + `Re-built now releases cache. *_${repo}_* ` +
							`Elapsed: ${(new Date() - start)}ms`

		if(tagPrev != data[key].tag && tagPrev != undefined){
			pm(`New Release on *_${repo}_*:\n ${data[key].tag} \n ${data[key].url}`)
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

	if(logs.log != "") log(logs.log)
	
	if(logs.error != "")  logError(logs.error)

}
