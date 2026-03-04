import fetch from 'node-fetch'
import { promises as fs } from 'fs'

const FILE_PATH = './lib/characters.json'

// memoria simple para evitar repetir la última imagen
const lastImageSent = new Map()

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
  return Object.entries(db)
    .find(([, serie]) =>
      Array.isArray(serie.characters) &&
      serie.characters.some(c => String(c.id) === String(id))
    )?.[1]?.name || 'Desconocido'
}

function formatTag(tag) {
  return String(tag).trim().toLowerCase().replace(/\s+/g, '_')
}

/* =========================
   BOORUS (MEJORADO)
========================= */

async function buscarImagenDelirius(tag) {
  const query = formatTag(tag)

  const urls = [
    `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&limit=25&tags=${query}`,
    `https://danbooru.donmai.us/posts.json?limit=25&tags=${query}`,
    `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=25&tags=${query}&api_key=f965be362e70972902e69652a472b8b2df2c5d876cee2dc9aebc7d5935d128db98e9f30ea4f1a7d497e762f8a82f132da65bc4e56b6add0f6283eb9b16974a1a&user_id=1862243`
  ]

  let allImages = []

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json'
        }
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
        .filter(u =>
          typeof u === 'string' &&
          /\.(jpe?g|png)$/i.test(u)
        )

      allImages.push(...valid)

    } catch {}
  }

  return [...new Set(allImages)]
}

/* =========================
   FALLBACK ANILIST
========================= */

async function buscarImagenAniList(nombre) {
  try {
    const query = `
      query ($search: String) {
        Character(search: $search) {
          image { large medium }
        }
      }
    `

    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { search: nombre }
      })
    })

    const json = await res.json()
    const img = json?.data?.Character?.image

    const list = []
    if (img?.large) list.push(img.large)
    if (img?.medium) list.push(img.medium)

    return list

  } catch {
    return []
  }
}

/* =========================
   COMANDO
========================= */

export default {
  command: ['charimage', 'waifuimage', 'cimage', 'wimage'],
  category: 'gacha',

  run: async (client, m, args, usedPrefix, command) => {
    try {
      const chat = global.db.data.chats[m.chat]

      if (chat.adminonly || !chat.gacha) {
        return m.reply(
          `ꕥ Los comandos de *Gacha* están desactivados en este grupo.\n\n` +
          `Un *administrador* puede activarlos con el comando:\n» *${usedPrefix}gacha on*`
        )
      }

      if (!args.length) {
        return m.reply(
          `❀ Por favor, proporciona el nombre de un personaje.\n` +
          `> Ejemplo » *${usedPrefix + command} Yuki Suou*`
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

      /* ===== BUSCAR IMAGEN ===== */

      let mediaList = await buscarImagenDelirius(tag)

      if (!mediaList.length) {
        mediaList = await buscarImagenAniList(character.name)
      }

      if (!mediaList.length) {
        return m.reply(
          `ꕥ No se encontraron imágenes para *${character.name}*.`
        )
      }

      // evitar repetir la última
      const last = lastImageSent.get(character.id)
      const filtered = mediaList.filter(u => u !== last)

      const usable = filtered.length ? filtered : mediaList
      const media = usable[Math.floor(Math.random() * usable.length)]

      lastImageSent.set(character.id, media)

      const source =
        getSeriesNameByCharacter(dbChars, character.id)

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
        `> Error ejecutando *${usedPrefix + command}*\n` +
        `> [${e.message}]`
      )
    }
  }
}
