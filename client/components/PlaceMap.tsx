import { useEffect } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
  ZoomControl,
} from "react-leaflet";
import type { Candidate, Place } from "../../shared/contracts";

interface PlaceMapProps {
  places: Place[];
  candidates: Candidate[];
  selectedPlaceId: string | null;
  selectedCandidateId: string | null;
  onSelectPlace: (id: string) => void;
  onSelectCandidate: (id: string) => void;
}

export function PlaceMap({
  places,
  candidates,
  selectedPlaceId,
  selectedCandidateId,
  onSelectPlace,
  onSelectCandidate,
}: PlaceMapProps) {
  const points = [
    ...places.map((place) => ({
      latitude: place.latitude,
      longitude: place.longitude,
    })),
    ...candidates
      .filter((candidate) => !candidate.addedPlaceId)
      .map((candidate) => ({
        latitude: candidate.latitude,
        longitude: candidate.longitude,
      })),
  ];

  return (
    <MapContainer
      center={[34.25, 108.95]}
      zoom={5}
      minZoom={4}
      maxZoom={18}
      zoomControl={false}
      className="place-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ZoomControl position="bottomright" />
      <MapViewport points={points} />

      {places.map((place) => (
        <Marker
          key={place.id}
          position={[place.latitude, place.longitude]}
          icon={placeIcon(place.liked, selectedPlaceId === place.id)}
          eventHandlers={{ click: () => onSelectPlace(place.id) }}
          zIndexOffset={selectedPlaceId === place.id ? 1000 : 400}
        >
          <Tooltip direction="top" offset={[0, -16]} opacity={1}>
            <strong>{place.name}</strong>
            <span>{place.type}</span>
          </Tooltip>
        </Marker>
      ))}

      {candidates
        .filter((candidate) => !candidate.addedPlaceId)
        .map((candidate, index) => (
          <Marker
            key={candidate.id}
            position={[candidate.latitude, candidate.longitude]}
            icon={candidateIcon(
              index + 1,
              selectedCandidateId === candidate.id,
            )}
            eventHandlers={{
              click: () => onSelectCandidate(candidate.id),
            }}
            zIndexOffset={
              selectedCandidateId === candidate.id ? 900 : 200
            }
          >
            <Tooltip direction="top" offset={[0, -16]} opacity={1}>
              <strong>{candidate.name}</strong>
              <span>候选 · {candidate.confidence}%</span>
            </Tooltip>
          </Marker>
        ))}
    </MapContainer>
  );
}

function MapViewport({
  points,
}: {
  points: Array<{ latitude: number; longitude: number }>;
}) {
  const map = useMap();
  const signature = points
    .map((point) => `${point.latitude},${point.longitude}`)
    .join("|");

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.flyTo([points[0].latitude, points[0].longitude], 13, {
        duration: 0.8,
      });
      return;
    }
    map.fitBounds(
      L.latLngBounds(
        points.map((point) => [point.latitude, point.longitude]),
      ),
      { padding: [90, 90], maxZoom: 13, animate: true },
    );
    // `signature` deliberately represents coordinate changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);

  return null;
}

function placeIcon(liked: boolean, selected: boolean) {
  return L.divIcon({
    className: "map-marker-shell",
    html: `<span class="map-marker place-marker${liked ? " is-liked" : ""}${selected ? " is-selected" : ""}">
      <span class="place-marker-core">${liked ? "♥" : ""}</span>
    </span>`,
    iconSize: [34, 42],
    iconAnchor: [17, 38],
  });
}

function candidateIcon(index: number, selected: boolean) {
  return L.divIcon({
    className: "map-marker-shell",
    html: `<span class="map-marker candidate-marker${selected ? " is-selected" : ""}">${index}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}
