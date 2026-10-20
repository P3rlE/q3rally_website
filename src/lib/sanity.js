import { createClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';

export const client = createClient({
  projectId: import.meta.env.SANITY_PROJECT_ID,
  dataset: import.meta.env.SANITY_DATASET ?? 'production',
  apiVersion: '2024-01-01',
  useCdn: false,
});

const builder = imageUrlBuilder(client);

// Hilfsfunktion: Sanity-Bild-Referenz → URL
// Beispiel: urlFor(car.image).width(800).url()
export function urlFor(source) {
  return builder.image(source);
}

// ─── Queries ──────────────────────────────────────────────

export async function getCars() {
  return client.fetch(`
    *[_type == "car"] | order(orderRank) {
      _id, name, description, image
    }
  `);
}

export async function getMaps() {
  return client.fetch(`
    *[_type == "map"] | order(orderRank) {
      _id, name, description,
      mainImage,
      "screenshots": screenshots[]
    }
  `);
}

export async function getPowerups() {
  return client.fetch(`
    *[_type == "powerup"] | order(orderRank) {
      _id, name, description, image
    }
  `);
}

export async function getWeapons() {
  return client.fetch(`
    *[_type == "weapon"] | order(orderRank) {
      _id, name, description, image
    }
  `);
}

export async function getRoadsideObjects() {
  return client.fetch(`
    *[_type == "roadsideObject"] | order(orderRank) {
      _id, name, description, image
    }
  `);
}

export async function getNewsPosts() {
  return client.fetch(`
    *[_type == "newsPost"] | order(publishedAt desc) {
      _id, title, publishedAt, body
    }
  `);
}

export async function getLatestBuild() {
  return client.fetch(`
    *[_type == "build" && category == "Stable"] | order(publishedAt desc)[0] {
      version, publishedAt, changelog, fileHash,
      platforms[] { name, subtitle, size, url, recommended }
    }
  `);
}

export async function getBuilds() {
  return client.fetch(`
    *[_type == "build"] | order(publishedAt desc) {
      version, publishedAt, changelog, fileHash, isCurrent, category,
      platforms[] { name, subtitle, size, url, recommended },
      "screenshots": screenshots[]
    }
  `);
}

export async function getCurrentBuilds() {
  return client.fetch(`
    *[_type == "build" && isCurrent == true] | order(publishedAt desc) {
      version, publishedAt, changelog, fileHash, category,
      platforms[] { name, subtitle, size, url, recommended },
      "screenshots": screenshots[]
    }
  `);
}

export async function getVideos() {
  return client.fetch(`
    *[_type == "video"] | order(orderRank) {
      _id, title, youtubeId, description
    }
  `);
}

export async function getScreenshots() {
  return client.fetch(`
    *[_type == "screenshot"] | order(orderRank) {
      _id, caption, image
    }
  `);
}

export async function getCounts() {
  const [cars, maps, powerups, weapons, roadside] = await Promise.all([
    client.fetch(`count(*[_type == "car"])`),
    client.fetch(`count(*[_type == "map"])`),
    client.fetch(`count(*[_type == "powerup"])`),
    client.fetch(`count(*[_type == "weapon"])`),
    client.fetch(`count(*[_type == "roadsideObject"])`),
  ]);
  return { cars, maps, powerups, weapons, roadside };
}

export async function getGameModes() {
  return client.fetch(`*[_type == "gameMode"] | order(_updatedAt asc) {
    gametype, name, category, description, objective, note, development, image, orderRank
  }`);
}
