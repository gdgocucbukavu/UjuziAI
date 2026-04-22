import { Gift, Info, Settings2, CalendarDays, ShieldCheck, Megaphone, X } from 'lucide-react';

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
            />
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
