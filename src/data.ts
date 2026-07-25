import type { ExternalTool, Game, ManifestEntry, SteamAccount } from "./types";

const header = (appid: number) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;

export const featuredGames: Game[] = [
  {
    appid: 1091500,
    name: "Cyberpunk 2077",
    image: header(1091500),
    price: "₺1,999.00",
    discount: 0,
    type: "Game",
    platforms: ["Windows"],
    review: "Very Positive",
    reviewScore: 84,
    players: "41.2K",
    deck: "Playable",
    tags: ["Cyberpunk", "Open World", "RPG"],
    releaseDate: "10 Dec, 2020",
    dlcCount: 1,
    summary:
      "An open-world action-adventure RPG set in Night City, a megalopolis obsessed with power, glamour and body modification."
  },
  {
    appid: 1086940,
    name: "Baldur's Gate 3",
    image: header(1086940),
    price: "₺1,199.00",
    type: "Game",
    platforms: ["Windows", "macOS"],
    review: "Overwhelmingly Positive",
    reviewScore: 96,
    players: "78.4K",
    deck: "Verified",
    tags: ["RPG", "Choices Matter", "Story Rich"],
    releaseDate: "3 Aug, 2023",
    summary:
      "Gather your party and return to the Forgotten Realms in a tale of fellowship and betrayal, sacrifice and survival."
  },
  {
    appid: 1245620,
    name: "ELDEN RING",
    image: header(1245620),
    price: "₺1,799.00",
    type: "Game",
    platforms: ["Windows"],
    review: "Very Positive",
    reviewScore: 93,
    players: "52.7K",
    deck: "Verified",
    tags: ["Souls-like", "Open World", "Dark Fantasy"],
    releaseDate: "25 Feb, 2022",
    dlcCount: 1,
    summary:
      "Rise, Tarnished, and be guided by grace to brandish the power of the Elden Ring."
  },
  {
    appid: 275850,
    name: "No Man's Sky",
    image: header(275850),
    price: "₺925.00",
    type: "Game",
    platforms: ["Windows", "macOS"],
    review: "Very Positive",
    reviewScore: 82,
    players: "18.9K",
    deck: "Playable",
    tags: ["Open World", "Space", "Exploration"],
    releaseDate: "12 Aug, 2016",
    summary:
      "A science-fiction adventure set in an infinite procedurally generated universe."
  },
  {
    appid: 1145350,
    name: "Hades II",
    image: header(1145350),
    price: "₺719.00",
    type: "Game",
    platforms: ["Windows"],
    review: "Very Positive",
    reviewScore: 94,
    players: "12.3K",
    deck: "Verified",
    tags: ["Roguelike", "Action", "Mythology"],
    summary:
      "Battle beyond the Underworld using dark sorcery to take on the sinister Titan of Time."
  },
  {
    appid: 730,
    name: "Counter-Strike 2",
    image: header(730),
    price: "Free",
    type: "Game",
    platforms: ["Windows", "Linux"],
    review: "Very Positive",
    reviewScore: 87,
    players: "1.1M",
    deck: "Playable",
    tags: ["FPS", "Competitive", "Multiplayer"],
    summary:
      "The largest technical leap forward in Counter-Strike history, ensuring new features for years to come."
  }
];

export const installedGames: Game[] = [
  {
    ...featuredGames[1],
    installed: true,
    installDir: "D:\\SteamLibrary\\steamapps\\common\\Baldurs Gate 3",
    buildId: "18451207",
    sizeOnDisk: 148_300_000_000,
    lastUpdated: "Today"
  },
  {
    ...featuredGames[2],
    installed: true,
    installDir: "D:\\SteamLibrary\\steamapps\\common\\ELDEN RING",
    buildId: "18120444",
    sizeOnDisk: 68_900_000_000,
    lastUpdated: "3 days ago"
  },
  {
    ...featuredGames[5],
    installed: true,
    installDir: "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive",
    buildId: "18802031",
    sizeOnDisk: 42_700_000_000,
    lastUpdated: "Yesterday"
  }
];

export const sampleAccounts: SteamAccount[] = [
  {
    steamId: "76561198000000001",
    accountName: "atlas_preview",
    personaName: "Atlas Preview",
    mostRecent: true,
    rememberPassword: true,
    level: 86,
    games: 428,
    playtime: 7420,
    country: "TR"
  },
  {
    steamId: "76561198000000002",
    accountName: "second_profile",
    personaName: "Second Profile",
    mostRecent: false,
    rememberPassword: false,
    level: 31,
    games: 162,
    playtime: 2180,
    country: "DE"
  }
];

export const sampleTools: ExternalTool[] = [
  {
    id: "tool-1",
    name: "ReShade Installer",
    description: "Manage post-processing presets for supported games.",
    path: "C:\\Tools\\ReShade_Setup.exe",
    args: [],
    category: "Graphics",
    color: "#66e3ff",
    favorite: true
  },
  {
    id: "tool-2",
    name: "Save Backup",
    description: "Open your local save-game backup utility.",
    path: "C:\\Tools\\GameSaveManager.exe",
    args: [],
    category: "Backup",
    color: "#a78bfa",
    favorite: false
  }
];

export const sampleManifests: ManifestEntry[] = [
  {
    id: "manifest-1",
    fileName: "appmanifest_1086940.acf",
    filePath: "D:\\SteamLibrary\\steamapps\\appmanifest_1086940.acf",
    appId: "1086940",
    manifestId: "local-app-state",
    size: 1247,
    importedAt: "Detected today",
    status: "valid"
  },
  {
    id: "manifest-2",
    fileName: "appmanifest_1245620.acf",
    filePath: "D:\\SteamLibrary\\steamapps\\appmanifest_1245620.acf",
    appId: "1245620",
    manifestId: "local-app-state",
    size: 982,
    importedAt: "Detected today",
    status: "valid"
  }
];
