import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAuth } from "../../context/auth.js";
import { fetchStand, updateStand, STAND_TYPE_LABEL, type StandDetail } from "../../api/stands.js";
import { StatusBadge } from "../../components/StatusBadge.js";

function PhotoGallery({ urls }: { urls: string[] }) {
  const [active, setActive] = useState(0);
  return (
    <div className="space-y-2">
      <div className="h-72 rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
        <img src={urls[active]} alt="" className="w-full h-full object-cover" />
      </div>
      {urls.length > 1 && (
        <div className="flex gap-2">
          {urls.map((u, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${i === active ? "border-forest-500" : "border-gray-200 opacity-60 hover:opacity-100"}`}
            >
              <img src={u} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function StandDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch, auth } = useAuth();
  const [stand, setStand] = useState<StandDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<StandDetail>>({});
  const [saving, setSaving] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  const canEdit = auth?.claims.role === "council_secretary" || auth?.claims.role === "founder";

  useEffect(() => {
    if (!id) return;
    fetchStand(apiFetch, id)
      .then(setStand)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [apiFetch, id]);

  // Initialise Leaflet map once stand is loaded
  useEffect(() => {
    if (!stand || !mapRef.current) return;
    if (mapInstance.current) {
      mapInstance.current.remove();
    }

    const map = L.map(mapRef.current).setView([stand.gpsLatitude, stand.gpsLongitude], 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);
    L.marker([stand.gpsLatitude, stand.gpsLongitude])
      .addTo(map)
      .bindPopup(stand.addressDescription)
      .openPopup();

    mapInstance.current = map;
    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [stand]);

  async function handleSave() {
    if (!id || !stand) return;
    setSaving(true);
    try {
      const updated = await updateStand(apiFetch, id, editData);
      setStand({ ...stand, ...updated });
      setEditing(false);
      setEditData({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!stand) return <div className="p-6 text-gray-500">Not found</div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link to=".." className="text-forest-600 hover:underline text-sm">← Stands</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{stand.addressDescription}</h1>
          <p className="text-gray-500 text-sm mt-1">{stand.villageOrSection}</p>
        </div>
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium">
            Edit
          </button>
        )}
      </div>

      {/* Photo gallery */}
      {stand.photoUrls.length > 0 && (
        <PhotoGallery urls={stand.photoUrls} />
      )}

      {/* Map */}
      <div ref={mapRef} className="h-64 rounded-xl overflow-hidden border border-gray-200 shadow-sm" />

      {/* Details card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {stand.standType && (
            <InfoRow label="Stand type" value={STAND_TYPE_LABEL[stand.standType as keyof typeof STAND_TYPE_LABEL] ?? stand.standType} />
          )}
          <InfoRow label="Allocation price" value={stand.priceZar != null ? `R ${stand.priceZar.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "Not priced"} />
          <InfoRow label="Area (m²)" value={stand.areaSquareMetres !== null ? stand.areaSquareMetres.toLocaleString() : "—"} />
          <InfoRow label="GPS" value={`${stand.gpsLatitude.toFixed(6)}, ${stand.gpsLongitude.toFixed(6)}`} />
          <InfoRow label="Reference" value={stand.localReference ?? "—"} />
          <InfoRow label="Added">
            <span>{new Date(stand.createdAt).toLocaleDateString()}</span>
          </InfoRow>
        </div>
        {editing && (
          <div className="space-y-3 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Allocation price (R)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">R</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-forest-500"
                  value={editData.priceZar ?? stand.priceZar ?? ""}
                  onChange={(e) => setEditData((d) => ({ ...d, priceZar: e.target.value ? parseFloat(e.target.value) : null }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Notes</label>
              <textarea
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-forest-500 resize-none"
                value={editData.notes ?? stand.notes ?? ""}
                onChange={(e) => setEditData((d) => ({ ...d, notes: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => void handleSave()} disabled={saving} className="bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium">
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => { setEditing(false); setEditData({}); }} className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Occupants */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
        <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Occupants</h2>
        {stand.occupants.length === 0 ? (
          <p className="text-gray-500 text-sm">No occupants recorded</p>
        ) : (
          <div className="space-y-2">
            {stand.occupants.map((occ) => (
              <div key={occ.occupancyId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <Link to={`/dashboard/land/residents/${occ.residentId}`} className="text-forest-700 hover:underline font-medium text-sm">
                    {occ.firstName} {occ.lastName}
                  </Link>
                  <p className="text-gray-500 text-xs mt-0.5">
                    Since {new Date(occ.startedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={occ.relationship} />
                  {occ.endedAt && (
                    <span className="text-xs text-gray-400">
                      ended {new Date(occ.endedAt).toLocaleDateString()}
                    </span>
                  )}
                  {occ.ptoId && (
                    <span className="bg-forest-100 text-forest-700 text-xs px-2 py-0.5 rounded-full">PTO</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      {children ?? <p className="text-gray-900">{value}</p>}
    </div>
  );
}
