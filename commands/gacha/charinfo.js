import fetch from 'node-fetch'
import { promises as fs } from 'fs'

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
  return Object.values(db).flatMap(s => Array.isArray(s.characters) ? s.characters : [])
}

function getSeriesNameByCharacter(db, id) {
  return Object.entries(db).find(([, serie]) => Array.isArray(serie.characters) && serie.characters.some(c => String(c.id) === String(id)))?.[1]?.name || 'Desconocido'
}

function formatTag(tag) {
  return String(tag).trim().toLowerCase().replace(/\s+/g, '_')
}

// Búsqueda en booru (original)
async function buscarImagenDelirius(tag) {
  const query = formatTag(tag)
  const urls = [
    `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&tags=${query}`,
    `https://danbooru.donmai.us/posts.json?tags=${query}`,
    `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&tags=${query}&api_key=f965be362e70972902e69652a472b8b2df2c5d876cee2dc9aebc7d5935d128db98e9f30ea4f1a7d497e762f8a82f132da65bc4e56b6add0f6283eb9b16974a1a&user_id=1862243`
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      })
      const type = res.headers.get('content-type') || ''
      if (!res.ok || !type.includes('json')) continue
      const json = await res.json()
      const data = Array.isArray(json) ? json : json?.post || json?.data || []
      const valid = data.map(i => i?.file_url || i?.large_file_url || i?.image || i?.media_asset?.variants?.[0]?.url).filter(u => typeof u === 'string' && /\.(jpe?g|png)$/i.test(u))
      if (valid.length) return valid
    } catch {}
  }
  return []
}

// --- Funciones de búsqueda en Pinterest (adaptadas del comando original) ---

// Asume que global.APIs está definido en el entorno del bot
async function getPinterestSearch(query) {
  const apis = [
    `${global.APIs.stellar.url}/search/pinterest?query=${encodeURIComponent(query)}&key=${global.APIs.stellar.key}`,
    `${global.APIs.stellar.url}/search/pinterestv2?query=${encodeURIComponent(query)}&key=${global.APIs.stellar.key}`,
    `${global.APIs.delirius.url}/search/pinterestv2?text=${encodeURIComponent(query)}`,
    `${global.APIs.vreden.url}/api/v1/search/pinterest?query=${encodeURIComponent(query)}`,
    `${global.APIs.vreden.url}/api/v2/search/pinterest?query=${encodeURIComponent(query)}&limit=10&type=videos`,
    `${global.APIs.delirius.url}/search/pinterest?text=${encodeURIComponent(query)}`,
    `${global.APIs.siputzx.url}/api/s/pinterest?query=${encodeURIComponent(query)}&type=image`
  ]

  for (const endpoint of apis) {
    try {
      const res = await fetch(endpoint).then(r => r.json())
      if (res?.data?.length) {
        return res.data.map(d => ({
          type: 'image',
          title: d.title || null,
          description: d.description || null,
          name: d.full_name || d.name || null,
          username: d.username || null,
          followers: d.followers || null,
          likes: d.likes || null,
          created_at: d.created || d.created_at || null,
          image: d.hd || d.image || null
        }))
      }
      if (res?.response?.pins?.length) {
        return res.response.pins.map(p => ({
          type: p.media?.video ? 'video' : 'image',
          title: p.title || null,
          description: p.description || null,
          name: p.uploader?.full_name || null,
          username: p.uploader?.username || null,
          followers: p.uploader?.followers || null,
          likes: null,
          created_at: null,
          image: p.media?.images?.orig?.url || null
        }))
      }
      if (res?.results?.length) {
        return res.results.map(url => ({
          type: 'image',
          title: null,
          description: null,
          name: null,
          username: null,
          followers: null,
          likes: null,
          created_at: null,
          image: url
        }))
      }
      if (res?.result?.search_data?.length) {
        return res.result.search_data.map(url => ({
          type: 'image',
          title: null,
          description: null,
          name: null,
          username: null,
          followers: null,
          likes: null,
          created_at: null,
          image: url
        }))
      }
      if (res?.result?.result?.length) {
        return res.result.result.map(d => ({
          type: d.media_urls?.[0]?.type || 'video',
          title: d.title || null,
          description: d.description || null,
          name: d.uploader?.full_name || null,
          username: d.uploader?.username || null,
          followers: d.uploader?.followers || null,
          likes: null,
          created_at: null,
          image: d.media_urls?.[0]?.url || null
        }))
      }
      if (res?.data?.length && res.data[0]?.image_url) {
        return res.data.map(d => ({
          type: d.type || 'image',
          title: d.grid_title || null,
          description: d.description || null,
          name: d.pinner?.full_name || null,
          username: d.pinner?.username || null,
          followers: d.pinner?.follower_count || null,
          likes: d.reaction_counts?.[1] || null,
          created_at: d.created_at || null,
          image: d.image_url || null
        }))
      }
    } catch {}
  }
  return []
}

async function buscarImagenPinterest(query) {
  const results = await getPinterestSearch(query)
  if (!results || results.length === 0) return []
  // Filtrar solo imágenes y devolver las URLs
  return results.filter(r => r.type === 'image').map(r => r.image).filter(Boolean)
}

// --- Comando principal ---

export default {
  command: ['charimage', 'waifuimage', 'cimage', 'wimage'],
  category: 'gacha',
  run: async (client, m, args, usedPrefix, command) => {
    try {
      const chat = global.db.data.chats[m.chat]
      if (chat.adminonly || !chat.gacha) {
        return m.reply(`ꕥ Los comandos de *Gacha* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}gacha on*`)
      }
      if (!args.length) {
        return m.reply(`❀ Por favor, proporciona el nombre de un personaje.\n> Ejemplo » *${usedPrefix + command} Yuki Suou*`)
      }

      const dbChars = await loadCharacters()
      const allCharacters = flattenCharacters(dbChars)
      const nameQuery = args.join(' ').toLowerCase().trim()

      const character = allCharacters.find(c => String(c.name).toLowerCase() === nameQuery) ||
                        allCharacters.find(c => String(c.name).toLowerCase().includes(nameQuery) ||
                          (Array.isArray(c.tags) && c.tags.some(tag => tag.toLowerCase().includes(nameQuery)))) ||
                        allCharacters.find(c => nameQuery.split(' ').some(q => String(c.name).toLowerCase().includes(q) ||
                          (Array.isArray(c.tags) && c.tags.some(tag => tag.toLowerCase().includes(q)))))

      if (!character) {
        return m.reply(`ꕥ No se encontró el personaje *${nameQuery}*.`)
      }

      // Primero intentamos con el tag en booru
      const tag = Array.isArray(character.tags) ? character.tags[0] : null
      let mediaList = []
      if (tag) {
        mediaList = await buscarImagenDelirius(tag)
      }

      // Si no hay resultados en booru, intentamos con Pinterest usando el nombre del personaje
      let usedFallback = false
      if (mediaList.length === 0) {
        const pinterestUrls = await buscarImagenPinterest(character.name)
        if (pinterestUrls.length > 0) {
          mediaList = pinterestUrls
          usedFallback = true
        }
      }

      // Si aún no hay imágenes, mostrar mensaje de error
      if (mediaList.length === 0) {
        return m.reply(`ꕥ No se encontraron imágenes para *${character.name}*${tag ? ` con el tag *${tag}*` : ''} ni en Pinterest.`)
      }

      const media = mediaList[Math.floor(Math.random() * mediaList.length)]
      const source = getSeriesNameByCharacter(dbChars, character.id)
      const msg = `❀ Nombre » *${character.name}*\n⚥ Género » *${character.gender || 'Desconocido'}*\n❖ Fuente » *${source}*${usedFallback ? '\n' : ''}`

      await client.sendMessage(m.chat, { image: { url: media }, caption: msg }, { quoted: m })
    } catch (e) {
      await m.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`)
    }
  }
}
