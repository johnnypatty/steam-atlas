import { ImageOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Game } from "../types";

const unique = (values: Array<string | undefined>) =>
  [...new Set(values.filter((value): value is string => Boolean(value)))];

export function GameImage({
  game,
  className = "",
  alt = ""
}: {
  game: Game;
  className?: string;
  alt?: string;
}) {
  const candidates = useMemo(
    () =>
      unique([
        game.image,
        game.capsule,
        `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.appid}/header.jpg`,
        `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${game.appid}/header.jpg`,
        `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
        `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
        `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.appid}/capsule_616x353.jpg`
      ]),
    [game.appid, game.capsule, game.image]
  );
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [game.appid, game.image]);

  return (
    <span className={`smart-image ${className}`}>
      {index < candidates.length ? (
        <img
          src={candidates[index]}
          alt={alt}
          loading="lazy"
          onError={() => setIndex((current) => current + 1)}
        />
      ) : (
        <span className="image-fallback">
          <ImageOff size={22} />
          <small>{game.name}</small>
        </span>
      )}
    </span>
  );
}
