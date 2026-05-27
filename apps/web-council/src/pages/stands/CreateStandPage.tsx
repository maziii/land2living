import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import { createStand, uploadStandPhoto, STAND_TYPES, STAND_TYPE_LABEL } from "../../api/stands.js";

export function CreateStandPage() {
  const { apiFetch }  = useAuth();
  const navigate      = useNavigate();

  const [addressDescription, setAddressDescription] = useState("");
  const [villageOrSection, setVillageOrSection]     = useState("");
  const [standType, setStandType]                   = useState("");
  const [areaSquareMetres, setAreaSquareMetres]     = useState("");
  const [priceZar, setPriceZar]                     = useState("");
  const [localReference, setLocalReference]         = useState("");
  const [gpsLatitude, setGpsLatitude]               = useState("");
  const [gpsLongitude, setGpsLongitude]             = useState("");
  const [notes, setNotes]                           = useState("");

  const [photos, setPhotos]     = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileRef                 = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 3 - photos.length);
    if (!files.length) return;
    setPhotos(prev => [...prev, ...files]);
    setPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removePhoto(i: number) {
    URL.revokeObjectURL(previews[i] ?? "");
    setPhotos(prev => prev.filter((_, j) => j !== i));
    setPreviews(prev => prev.filter((_, j) => j !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!addressDescription.trim() || !villageOrSection.trim()) return;
    if (!gpsLatitude || !gpsLongitude) {
      setError("GPS coordinates are required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Upload photos first, collect s3Keys
      const photoS3Keys: string[] = [];
      for (const file of photos) {
        const key = await uploadStandPhoto(apiFetch, file);
        photoS3Keys.push(key);
      }

      const stand = await createStand(apiFetch, {
        addressDescription: addressDescription.trim(),
        villageOrSection:   villageOrSection.trim(),
        gpsLatitude:        parseFloat(gpsLatitude),
        gpsLongitude:       parseFloat(gpsLongitude),
        ...(standType          && { standType }),
        ...(areaSquareMetres   && { areaSquareMetres: parseFloat(areaSquareMetres) }),
        ...(priceZar           && { priceZar: parseFloat(priceZar) }),
        ...(localReference     && { localReference: localReference.trim() }),
        ...(photoS3Keys.length && { photoS3Keys }),
        ...(notes.trim()       && { notes: notes.trim() }),
      });

      navigate(`../${stand.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save stand");
      setSaving(false);
    }
  }

  const canAddPhotos = photos.length < 3;

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <Link to=".." className="text-forest-600 hover:underline text-sm">← Stands</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Add a stand</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Register a stand in the land register. Stands can be pre-loaded before applications arrive, or added when a request is received.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">

        {/* Photos */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-gray-600">Photos <span className="text-gray-400 font-normal normal-case">(up to 3)</span></h2>

          <div className="flex gap-3 flex-wrap">
            {previews.map((src, i) => (
              <div key={i} className="relative">
                <img src={src} alt="" className="w-28 h-28 object-cover rounded-xl border border-gray-200" />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 text-sm flex items-center justify-center shadow"
                >
                  ×
                </button>
                {i === 0 && (
                  <span className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">Cover</span>
                )}
              </div>
            ))}

            {canAddPhotos && (
              <label className="w-28 h-28 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-forest-400 hover:bg-forest-50 transition-colors">
                <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-xs text-gray-400">Add photo</span>
                <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
              </label>
            )}
          </div>

          <p className="text-xs text-gray-400">First photo is the cover image shown in the stand register and on offers to applicants.</p>
        </div>

        {/* Core details */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-gray-600">Stand details</h2>

          <div>
            <label className="block text-xs text-gray-600 font-medium mb-1">
              Address / description <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={addressDescription}
              onChange={e => setAddressDescription(e.target.value)}
              placeholder="e.g. Stand 42, near the community hall, KwaMhlanga"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-600 font-medium mb-1">
                Village / section <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={villageOrSection}
                onChange={e => setVillageOrSection(e.target.value)}
                placeholder="e.g. KwaMhlanga"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 font-medium mb-1">Stand type</label>
              <select
                value={standType}
                onChange={e => setStandType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              >
                <option value="">Not specified</option>
                {STAND_TYPES.map(t => (
                  <option key={t} value={t}>{STAND_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-600 font-medium mb-1">Area (m²)</label>
              <input
                type="number"
                min={1}
                value={areaSquareMetres}
                onChange={e => setAreaSquareMetres(e.target.value)}
                placeholder="e.g. 300"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 font-medium mb-1">Reference / stand number</label>
              <input
                type="text"
                value={localReference}
                onChange={e => setLocalReference(e.target.value)}
                placeholder="e.g. ND-042"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-600 font-medium mb-1">
              Allocation price (R)
              <span className="text-gray-400 font-normal ml-1">— leave blank if not yet priced</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-medium">R</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={priceZar}
                onChange={e => setPriceZar(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">This is the council's allocation fee, not a market price. Shown to applicants on the stand offer.</p>
          </div>

          <div>
            <label className="block text-xs text-gray-600 font-medium mb-1">Notes (optional)</label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any additional notes about the stand — access, condition, features…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 resize-none"
            />
          </div>
        </div>

        {/* GPS */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-sm uppercase tracking-wide text-gray-600">GPS coordinates</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Use Google Maps or a GPS device to find the coordinates. Right-click on the location in Google Maps to copy them.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-600 font-medium mb-1">
                Latitude <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                required
                value={gpsLatitude}
                onChange={e => setGpsLatitude(e.target.value)}
                placeholder="-25.746111"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-forest-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 font-medium mb-1">
                Longitude <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                required
                value={gpsLongitude}
                onChange={e => setGpsLongitude(e.target.value)}
                placeholder="28.188056"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-forest-500"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving || !addressDescription.trim() || !villageOrSection.trim() || !gpsLatitude || !gpsLongitude}
            className="bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? (photos.length > 0 ? "Uploading photos…" : "Saving…") : "Save stand"}
          </button>
          <Link
            to=".."
            className="border border-gray-300 hover:bg-gray-50 px-6 py-2.5 rounded-lg text-sm font-medium text-gray-700 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
