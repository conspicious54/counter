"use client";
import { Droplets, X } from "lucide-react";
import type { WaterEntry } from "@/lib/types";
import { dailyWater, waterContainers, type WaterContainer } from "@/lib/water";
function ContainerIcon({ type }: { type: WaterContainer }) {
  return (
    <svg
      width="32"
      height="42"
      viewBox="0 0 32 42"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {type === "yeti" ? (
        <>
          <path d="M5 12h20l-3 26H9L5 12Z" fill="currentColor" fillOpacity=".09" />
          <path d="M4 9h22v3H4zM19 9l2-7h5M25 16h2a3 3 0 0 1 3 3v6a4 4 0 0 1-4 4h-3" />
          <path d="M9 26h13" strokeOpacity=".45" />
        </>
      ) : (
        <>
          <path d="M12 8V4h8v4M13 4V2h6v2" />
          <path
            d="M11 8h10v6l4 5v17a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V19l4-5V8Z"
            fill="currentColor"
            fillOpacity=".09"
          />
          <path d="M11 12h10M8 26h16" strokeOpacity=".45" />
        </>
      )}
    </svg>
  );
}
export function WaterPanel({
  day,
  entries = [],
  onAdd,
  onRemove,
}: {
  day: string;
  entries?: WaterEntry[];
  onAdd: (container: WaterContainer) => void;
  onRemove: (id: string) => void;
}) {
  const { drinks, ounces, count } = dailyWater(entries, day);
  return (
    <section className="water-panel" aria-label="Water tracking">
      <div className="water-heading">
        <h2>
          <Droplets size={17} />
          Water
        </h2>
        <div role="status" aria-live="polite">
          <strong>
            {ounces} <span>oz</span>
          </strong>
          <small>
            {count} {count === 1 ? "drink" : "drinks"}
          </small>
        </div>
      </div>
      <div className="water-buttons">
        {(Object.keys(waterContainers) as WaterContainer[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onAdd(type)}
            aria-label={`Add ${waterContainers[type].ounces} oz water from ${waterContainers[type].name}`}
          >
            <ContainerIcon type={type} />
            <span>
              <strong>{waterContainers[type].name}</strong>
              <small>+{waterContainers[type].ounces} oz</small>
            </span>
          </button>
        ))}
      </div>
      {drinks.length ? (
        <>
          <ul className="water-drinks" aria-label="Logged water">
            {drinks.map((drink) => (
              <li key={drink.id}>
                <ContainerIcon type={drink.container} />
                <span>
                  {waterContainers[drink.container].name}
                  <small>
                    {new Date(drink.timestamp).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </small>
                </span>
                <strong>{drink.ounces} oz</strong>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => onRemove(drink.id)}
                  aria-label={`Remove ${drink.ounces} oz ${waterContainers[drink.container].name} drink`}
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="text-button water-undo"
            onClick={() => onRemove(drinks[drinks.length - 1].id)}
          >
            Undo last drink
          </button>
        </>
      ) : (
        <p className="water-empty">Tap a container to log a full drink.</p>
      )}
    </section>
  );
}
