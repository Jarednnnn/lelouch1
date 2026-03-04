import fetch from 'node-fetch'
import { promises as fs } from 'fs'
import { getPinterestSearch } from '../lib/pinterest.js' // ajusta la ruta si es necesario

const FILE_PATH = './lib/characters.json'

async function loadCharacters() {
  try {
    await fs.access(FILE_PATH)
  } catch {
    await fs.writeFile(FILE_PATH, '{}')
  }
  const raw = await fs.readFile(FILE_PATH, 'utf-8')
  return JSON.parse(raw)
}

function flattenCharacters(db) {
  return Object.values(db).flatMap(s =>
    Array.isArray(s.characters) ? s.characters : []
  )
}

function getSeriesNameByCharacter(db, id) {
  return (
    Object.entries(db).find(([, serie]) =>
      Array.isArray(serie.characters) &&
      serie.characters.some(c => String(c.id) === String(id))
    )?.[1]?.name || 'Desconocido'
  )
}

function formatTag(tag) {
  return String(tag).trim().toLowerCase().replace(/\s+/g, '_')
}

async function buscarImagenDelirius(tag) {
  const query = formatTag(tag)
  const urls = [
    `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&tags=${query}`,
    `https://danbooru.donmai.us/posts.json?tags=${query}`,
    `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&tags=${query}&api_key=TU_API_KEY&user_id=TU_USER_ID`
  ]

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      })

      const type = res.headers.get('content-type') || ''
      if (!res.ok || !type.includes('json')) continue

      const json = await res.json()
      const data = Array.isArray(json)
        ? json
        : json?.post || json?.data || []

      const valid = data
        .map(i =>
          i?.file_url ||
          i?.large_file_url ||
          i?.image ||
          i?.media_asset?.variants?.[0]?.url
        )
        .filter(u => typeof u === 'string' && /\.(jpe?g|png)$/i.test(u))

      if (valid.length) return valid
    } catch {}
  }

  return []
}

export default {
  command: ['charimage', 'waifuimage', 'cimage', 'wimage'],
  category: 'gacha',
  run: async (client, m, args, usedPrefix, command) => {
    try {
      const chat = global.db.data.chats[m.chat]

      if (chat.adminonly || !chat.gacha) {
        return m.reply(
          `ꕥ Los comandos de *Gacha* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}gacha on*`
        )
      }

      if (!args.length) {
        return m.reply(
          `❀ Por favor, proporciona el nombre de un personaje.\n> Ejemplo » *${usedPrefix + command} Yuki Suou*`
        )
      }

      const dbChars = await loadCharacters()
      const allCharacters = flattenCharacters(dbChars)
      const nameQuery = args.join(' ').toLowerCase().trim()

      const character =
        allCharacters.find(c =>
          String(c.name).toLowerCase() === nameQuery
        ) ||
        allCharacters.find(c =>
          String(c.name).toLowerCase().includes(nameQuery) ||
          (Array.isArray(c.tags) &&
            c.tags.some(tag =>
              tag.toLowerCase().includes(nameQuery)
            ))
        ) ||
        allCharacters.find(c =>
          nameQuery.split(' ').some(q =>
            String(c.name).toLowerCase().includes(q) ||
            (Array.isArray(c.tags) &&
              c.tags.some(tag =>
                tag.toLowerCase().includes(q)
              ))
          )
        )

      if (!character) {
        return m.reply(`ꕥ No se encontró el personaje *${nameQuery}*.`)
      }

      const tag = Array.isArray(character.tags)
        ? character.tags[0]
        : null

      if (!tag) {
        return m.reply(
          `ꕥ El personaje *${character.name}* no tiene un tag válido para buscar imágenes.`
        )
      }

      // 1️⃣ Buscar en booru
      let mediaList = await buscarImagenDelirius(tag)

      // 2️⃣ Fallback Pinterest si no hay resultados
      if (!mediaList.length) {
        const pinterestResults = await getPinterestSearch(tag)

        if (pinterestResults.length) {
          mediaList = pinterestResults
            .map(r => r.image)
            .filter(u => typeof u === 'string')
        }
      }

      const media =
        mediaList[Math.floor(Math.random() * mediaList.length)]

      if (!media) {
        return m.reply(
          `ꕥ No se encontraron imágenes para *${character.name}* con el tag *${tag}* en ninguna fuente.`
        )
      }

      const source = getSeriesNameByCharacter(dbChars, character.id)

      const msg =
        `❀ Nombre » *${character.name}*\n` +
        `⚥ Género » *${character.gender || 'Desconocido'}*\n` +
        `❖ Fuente » *${source}*`

      await client.sendMessage(
        m.chat,
        { image: { url: media }, caption: msg },
        { quoted: m }
      )

    } catch (e) {
      await m.reply(
        `> An unexpected error occurred while executing command *${usedPrefix + command}*.\n> [Error: *${e.message}*]`
      )
    }
  }
}
