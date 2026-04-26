import { Gift, Info, Settings2, CalendarDays, ShieldCheck, Megaphone, X, Image as ImageIcon, AlertCircle } from 'lucide-react';

const FALLBACK_COVER_IMAGE = '/icon-512.png';

function validateCoverImageUrl(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return { valid: true, url: '', error: '' };

  try {
    const parsedUrl = new URL(value);
    if (parsedUrl.protocol !== 'https:') {
      return { valid: false, url: '', error: 'L’URL doit commencer par https://' };
    }

    const pathname = parsedUrl.pathname.toLowerCase();
    if (!/\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)$/.test(pathname)) {
      return { valid: false, url: '', error: 'L’URL doit pointer vers une image (.jpg, .png, .webp, .svg, etc.)' };
    }

    return { valid: true, url: parsedUrl.toString(), error: '' };
  } catch {
    return { valid: false, url: '', error: 'URL invalide' };
  }
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="p-4 rounded-xl border border-themed bg-black/5 dark:bg-white/5 space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary-400" />
        <h3 className="text-sm font-semibold text-heading uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export default function AdminBuildathonEventForm({
  mode,
  value,
  onChange,
  onSubmit,
  onCancel,
  eventTypes,
}) {
  const submitLabel = mode === 'edit' ? 'Enregistrer les modifications' : 'Créer l\'événement';

  function setField(field, fieldValue) {
    onChange((prev) => ({ ...prev, [field]: fieldValue }));
  }

  function setPrize(index, patch) {
    const next = [...(value.prizes || [])];
    next[index] = { ...next[index], ...patch };
    onChange((prev) => ({ ...prev, prizes: next }));
  }

  const coverImageState = validateCoverImageUrl(value.coverImageUrl);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Section icon={Info} title="Informations">
        <div>
          <label className="block text-sm font-medium text-body mb-2">Type d'événement *</label>
          <div className="flex gap-3 flex-wrap">
            {eventTypes.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setField('type', t.value)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
                  value.type === t.value
                    ? 'border-primary-500 bg-primary-500/10 text-heading'
                    : 'border-themed text-body hover:border-primary-500/50'
                }`}
              >
                <span>{t.icon}</span>
                <span className="font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-body mb-1">Titre *</label>
            <input
              type="text"
              value={value.title}
              onChange={(e) => setField('title', e.target.value)}
              className="input-field w-full"
              required
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-body mb-1">Description courte</label>
            <input
              type="text"
              value={value.shortDescription}
              onChange={(e) => setField('shortDescription', e.target.value)}
              className="input-field w-full"
              placeholder="Résumé affiché dans les listes"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-body mb-1">Description complète</label>
            <textarea
              value={value.fullDescription}
              onChange={(e) => setField('fullDescription', e.target.value)}
              className="input-field w-full h-24 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-body mb-1">Statut</label>
            <select
              value={value.status}
              onChange={(e) => setField('status', e.target.value)}
              className="input-field w-full"
            >
              <option value="active">Actif</option>
              <option value="completed">Terminé</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-body mb-1">Image de couverture (URL)</label>
            <input
              type="url"
              value={value.coverImageUrl}
              onChange={(e) => setField('coverImageUrl', e.target.value)}
              className="input-field w-full"
              placeholder="https://..."
              pattern="^https://.*\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)(\?.*)?$"
              title="URL HTTPS d'image valide (.jpg, .png, .webp, .svg, etc.)"
              aria-invalid={!coverImageState.valid}
            />
            <p className={`mt-1 text-[11px] inline-flex items-center gap-1 ${coverImageState.valid ? 'text-muted' : 'text-red-400'}`}>
              {!coverImageState.valid && <AlertCircle className="w-3 h-3 shrink-0" />}
              {coverImageState.valid
                ? 'URL HTTPS d’image valide. La couverture sera affichée sur les cartes événements.'
                : coverImageState.error}
            </p>

            <div className="mt-3 rounded-xl border border-themed bg-black/5 dark:bg-white/5 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-themed bg-black/10 dark:bg-white/10">
                <ImageIcon className="w-4 h-4 text-primary-400" />
                <span className="text-xs font-semibold text-heading uppercase tracking-wide">Aperçu couverture</span>
              </div>
              <div className="relative aspect-[16/6] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950">
                {coverImageState.valid && coverImageState.url ? (
                  <img
                    src={coverImageState.url}
                    alt="Aperçu de la couverture"
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.src = FALLBACK_COVER_IMAGE;
                    }}
                  />
                ) : (
                  <img
                    src={FALLBACK_COVER_IMAGE}
                    alt="Couverture par défaut"
                    className="absolute inset-0 h-full w-full object-cover opacity-85"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                <div className="absolute inset-0 flex items-end p-3">
                  <div className="max-w-[70%] rounded-lg bg-black/45 backdrop-blur-sm px-3 py-2 border border-white/10">
                    <p className="text-xs font-semibold text-white">{value.title || 'Titre de l’événement'}</p>
                    <p className="text-[11px] text-white/80">{(value.mode || 'public') === 'jury' ? 'Mode jury' : 'Mode public'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section icon={CalendarDays} title="Calendrier">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-body mb-1">Début événement *</label>
            <input
              type="datetime-local"
              value={value.startDate}
              onChange={(e) => setField('startDate', e.target.value)}
              className="input-field w-full"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Fin événement *</label>
            <input
              type="datetime-local"
              value={value.endDate}
              onChange={(e) => setField('endDate', e.target.value)}
              className="input-field w-full"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Durée de travail</label>
            <input
              type="text"
              value={value.workDuration}
              onChange={(e) => setField('workDuration', e.target.value)}
              className="input-field w-full"
              placeholder="Ex: 48h"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-body mb-1">Début soumissions</label>
            <input
              type="datetime-local"
              value={value.submissionStartDate}
              onChange={(e) => setField('submissionStartDate', e.target.value)}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Fin soumissions</label>
            <input
              type="datetime-local"
              value={value.submissionEndDate}
              onChange={(e) => setField('submissionEndDate', e.target.value)}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Taille max équipe</label>
            <input
              type="number"
              min="1"
              max="10"
              value={value.maxTeamSize}
              onChange={(e) => setField('maxTeamSize', e.target.value)}
              className="input-field w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-body mb-1">Début vote</label>
            <input
              type="datetime-local"
              value={value.voteStartDate}
              onChange={(e) => setField('voteStartDate', e.target.value)}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Fin vote</label>
            <input
              type="datetime-local"
              value={value.voteEndDate}
              onChange={(e) => setField('voteEndDate', e.target.value)}
              className="input-field w-full"
            />
          </div>
        </div>
      </Section>

      <Section icon={Settings2} title="Paramètres de Vote">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <p className="block text-sm font-medium text-body mb-2">Mode de classement</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'public', label: 'Public', description: 'Votes et likes visibles au public' },
                { value: 'jury', label: 'Jury', description: 'Classement piloté par les juges' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setField('mode', option.value)}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${
                    (value.mode || 'public') === option.value
                      ? 'border-primary-500 bg-primary-500/10 text-heading'
                      : 'border-themed text-body hover:border-primary-500/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{option.label}</span>
                    <span className={`h-3 w-3 rounded-full ${(value.mode || 'public') === option.value ? 'bg-primary-500' : 'bg-white/20'}`} />
                  </div>
                  <p className="mt-1 text-xs text-muted">{option.description}</p>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted mt-2">Le mode jury active la section de gestion des juges dans l’admin et conserve la compatibilité avec les anciens événements.</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-body">
            <input
              type="checkbox"
              checked={value.votingEnabled}
              onChange={(e) => setField('votingEnabled', e.target.checked)}
            />
            Vote activé
          </label>

          <label className="flex items-center gap-2 text-sm text-body">
            <input
              type="checkbox"
              checked={value.allowSelfVote}
              onChange={(e) => setField('allowSelfVote', e.target.checked)}
            />
            Auto-vote autorisé
          </label>

          <div>
            <label className="block text-sm font-medium text-body mb-1">Votes max par utilisateur</label>
            <input
              type="number"
              min="1"
              value={1}
              disabled
              readOnly
              className="input-field w-full"
            />
            <p className="text-[11px] text-muted mt-1">Temporairement fixé à 1 pour garantir l'intégrité du vote par événement.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-body mb-1">Visibilité projets avant validation</label>
            <select
              value={value.projectVisibility}
              onChange={(e) => setField('projectVisibility', e.target.value)}
              className="input-field w-full"
            >
              <option value="published-only">Seulement publiés</option>
              <option value="all-submitted">Tous les soumis</option>
            </select>
          </div>
        </div>
      </Section>

      <Section icon={ShieldCheck} title="Règles">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-body mb-1">Règles de participation</label>
            <textarea
              value={value.participationRules}
              onChange={(e) => setField('participationRules', e.target.value)}
              className="input-field w-full h-20 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Critères d'évaluation</label>
            <textarea
              value={value.evaluationCriteria}
              onChange={(e) => setField('evaluationCriteria', e.target.value)}
              className="input-field w-full h-20 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Texte règle de départage</label>
            <textarea
              value={value.tieBreakRuleText}
              onChange={(e) => setField('tieBreakRuleText', e.target.value)}
              className="input-field w-full h-16 resize-none"
              placeholder="Ex: En cas d'égalité, priorité à la soumission la plus ancienne"
            />
          </div>
        </div>
      </Section>

      <Section icon={Gift} title="Récompenses">
        <label className="flex items-center gap-2 text-sm text-body">
          <input
            type="checkbox"
            checked={value.rewardsVisible !== false}
            onChange={(e) => setField('rewardsVisible', e.target.checked)}
          />
          Afficher les récompenses côté utilisateurs
        </label>

        <div className="space-y-2">
          {(value.prizes || []).map((prize, i) => (
            <div key={i} className="grid sm:grid-cols-4 gap-2 items-center">
              <div className="flex items-center gap-2 text-sm text-body">
                <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${prize.place}`}</span>
                <span>Place {prize.place}</span>
              </div>
              <select
                value={prize.rewardType || 'points'}
                onChange={(e) => setPrize(i, { rewardType: e.target.value })}
                className="input-field w-full"
              >
                <option value="points">Points</option>
                <option value="swag">Swag</option>
                <option value="prize">Prix</option>
              </select>

              {(prize.rewardType || 'points') === 'points' ? (
                <input
                  type="number"
                  min="0"
                  value={prize.points}
                  onChange={(e) => setPrize(i, { points: e.target.value })}
                  className="input-field w-full"
                  placeholder="Points"
                />
              ) : (
                <input
                  type="text"
                  value={prize.label}
                  onChange={(e) => setPrize(i, { label: e.target.value })}
                  className="input-field w-full"
                  placeholder="Ex: Swag / Bourse / Goodies"
                />
              )}

              <input
                type="number"
                min="1"
                value={prize.place}
                onChange={(e) => setPrize(i, { place: Number(e.target.value) || i + 1 })}
                className="input-field w-full"
                placeholder="Rang"
              />
            </div>
          ))}
        </div>
      </Section>

      <Section icon={Megaphone} title="Publication">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-body mb-1">Statut publication</label>
            <select
              value={value.publicationStatus}
              onChange={(e) => setField('publicationStatus', e.target.value)}
              className="input-field w-full"
            >
              <option value="draft">Brouillon</option>
              <option value="published">Publié</option>
              <option value="archived">Archivé</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-body">
            <input
              type="checkbox"
              checked={value.submissionOpen}
              onChange={(e) => setField('submissionOpen', e.target.checked)}
            />
            Soumissions ouvertes
          </label>
        </div>
      </Section>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary inline-flex items-center gap-2">
          <X className="w-4 h-4" />
          Annuler
        </button>
        <button type="submit" className="btn-primary inline-flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
