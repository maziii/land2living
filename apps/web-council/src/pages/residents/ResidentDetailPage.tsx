import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import {
  fetchResident,
  fetchResidentStands,
  updateResident,
  type ResidentDetail,
  type OccupancyWithStand,
} from "../../api/residents.js";
import { StatusBadge } from "../../components/StatusBadge.js";

export function ResidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch, auth } = useAuth();
  const navigate = useNavigate();
  const [resident, setResident] = useState<ResidentDetail | null>(null);
  const [stands, setStands] = useState<OccupancyWithStand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<ResidentDetail>>({});
  const [saving, setSaving] = useState(false);

  const canEdit = auth?.claims.role === "council_secretary" || auth?.claims.role === "founder";

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetchResident(apiFetch, id),
      fetchResidentStands(apiFetch, id),
    ])
      .then(([r, { stands: s }]) => {
        setResident(r);
        setStands(s);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [apiFetch, id]);

  async function handleSave() {
    if (!id || !resident) return;
    setSaving(true);
    try {
      const updated = await updateResident(apiFetch, id, editData);
      setResident(updated);
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
  if (!resident) return <div className="p-6 text-gray-500">Not found</div>;

  const displayData = editing ? { ...resident, ...editData } : resident;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link to=".." className="text-forest-600 hover:underline text-sm">← Residents</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">
            {resident.firstName} {resident.lastName}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={resident.verificationStatus} />
          </div>
        </div>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium"
          >
            Edit
          </button>
        )}
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Profile</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <InfoRow label="ID Number" value={resident.idNumber} mono />
          <InfoRow label="Date of Birth" value={resident.dateOfBirth ?? "—"} />
          <InfoRow label="Gender" value={resident.gender ?? "—"} />
          <InfoRow label="Phone">{
            editing ? (
              <input
                className={inputClass}
                value={(editData.phoneNumber ?? resident.phoneNumber)}
                onChange={(e) => setEditData((d) => ({ ...d, phoneNumber: e.target.value }))}
              />
            ) : <span>{resident.phoneNumber}</span>
          }</InfoRow>
          <InfoRow label="WhatsApp" value={resident.whatsappNumber ?? "—"} />
          <InfoRow label="Language" value={resident.languagePreference} />
        </div>
        {editing && (
          <div className="pt-3 border-t border-gray-100 flex gap-2">
            <button onClick={() => void handleSave()} disabled={saving} className="bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => { setEditing(false); setEditData({}); }} className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium">
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Stands */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
        <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Occupied Stands</h2>
        {stands.length === 0 ? (
          <p className="text-gray-500 text-sm">No stands linked</p>
        ) : (
          <div className="space-y-2">
            {stands.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <Link to={`/dashboard/land/available/${s.standId}`} className="text-forest-700 hover:underline font-medium text-sm">
                    {s.stand.addressDescription}
                  </Link>
                  <p className="text-gray-500 text-xs mt-0.5">{s.stand.villageOrSection}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={s.relationship} />
                  {s.endedAt && <span className="text-xs text-gray-400">ended</span>}
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
  mono,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      {children ?? (
        <p className={`text-gray-900 ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
      )}
    </div>
  );
}

const inputClass = "border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-forest-500";
