import accessHandler from './access.js'

export default async function handler(req, res) {
  const currentQuery = (typeof req.query === 'object' && req.query !== null) ? req.query : {}
  req.query = {
    ...currentQuery,
    action: 'discord-callback'
  }
  return accessHandler(req, res)
}
