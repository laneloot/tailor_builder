'use client';

import { useEffect, useState } from 'react';
import { resumeApi } from '@/lib/api';

type SkillType = 'hard' | 'soft';

type EditingState = {
  type: SkillType;
  original: string;
  value: string;
} | null;

const normalize = (value: string) => value.trim().toLowerCase();

export default function SkillsPage() {
  const [techSkills, setTechSkills] = useState<string[]>([]);
  const [softSkills, setSoftSkills] = useState<string[]>([]);
  const [newTech, setNewTech] = useState('');
  const [newSoft, setNewSoft] = useState('');
  const [editing, setEditing] = useState<EditingState>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadSkills = async () => {
    try {
      setIsLoading(true);
      const [tech, soft] = await Promise.all([
        resumeApi.listSkills('hard'),
        resumeApi.listSkills('soft'),
      ]);
      setTechSkills(tech.skills);
      setSoftSkills(soft.skills);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSkills();
  }, []);

  const addSkill = async (type: SkillType, value: string) => {
    const cleaned = value.trim();
    if (!cleaned) return;

    const list = type === 'hard' ? techSkills : softSkills;
    if (list.some((item) => normalize(item) === normalize(cleaned))) {
      setError('Skill already exists.');
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      setSuccess('');
      const res = await resumeApi.addSkill({ type, skill: cleaned });
      if (!res.added) {
        setError('Skill already exists.');
        return;
      }
      if (type === 'hard') {
        setTechSkills((prev) => [...prev, cleaned]);
        setNewTech('');
      } else {
        setSoftSkills((prev) => [...prev, cleaned]);
        setNewSoft('');
      }
      setSuccess(`Added "${cleaned}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add skill');
    } finally {
      setIsSaving(false);
    }
  };

  const updateSkill = async (type: SkillType, original: string, nextValue: string) => {
    const cleaned = nextValue.trim();
    if (!cleaned) return;

    const list = type === 'hard' ? techSkills : softSkills;
    if (list.some((item) => normalize(item) === normalize(cleaned) && normalize(item) !== normalize(original))) {
      setError('Skill already exists.');
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      setSuccess('');
      await resumeApi.updateSkill({ type, original, skill: cleaned });
      const updateList = (items: string[]) => items.map((item) => (item === original ? cleaned : item));
      if (type === 'hard') {
        setTechSkills(updateList);
      } else {
        setSoftSkills(updateList);
      }
      setEditing(null);
      setSuccess(`Updated "${original}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update skill');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSkill = async (type: SkillType, skill: string) => {
    try {
      setIsSaving(true);
      setError('');
      setSuccess('');
      await resumeApi.deleteSkill({ type, skill });
      const remove = (items: string[]) => items.filter((item) => item !== skill);
      if (type === 'hard') {
        setTechSkills(remove);
      } else {
        setSoftSkills(remove);
      }
      if (editing && editing.original === skill) {
        setEditing(null);
      }
      setSuccess(`Deleted "${skill}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete skill');
    } finally {
      setIsSaving(false);
    }
  };

  const renderList = (type: SkillType, skills: string[]) => (
    <div className="space-y-3">
      {skills.length === 0 && (
        <div className="text-sm text-gray-500">No skills yet.</div>
      )}
      {skills.map((skill) => {
        const isEditing = editing?.type === type && editing?.original === skill;
        return (
          <div key={`${type}-${skill}`} className="flex items-center gap-2">
            {isEditing ? (
              <input
                type="text"
                value={editing?.value ?? ''}
                onChange={(e) => setEditing({ type, original: skill, value: e.target.value })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            ) : (
              <span className="flex-1 text-sm text-gray-800">{skill}</span>
            )}
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={() => updateSkill(type, skill, editing?.value ?? '')}
                  disabled={isSaving}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  disabled={isSaving}
                  className="px-3 py-1.5 text-xs bg-white text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setEditing({ type, original: skill, value: skill })}
                  disabled={isSaving}
                  className="px-3 py-1.5 text-xs bg-white text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteSkill(type, skill)}
                  disabled={isSaving}
                  className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-300"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Skills Library</h1>
        <button
          type="button"
          onClick={loadSkills}
          className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-md hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading skills...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Tech Skills</h2>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTech}
                onChange={(e) => setNewTech(e.target.value)}
                placeholder="Add a tech skill"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <button
                type="button"
                onClick={() => addSkill('hard', newTech)}
                disabled={isSaving}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
              >
                Add
              </button>
            </div>
            {renderList('hard', techSkills)}
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Soft Skills</h2>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newSoft}
                onChange={(e) => setNewSoft(e.target.value)}
                placeholder="Add a soft skill"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <button
                type="button"
                onClick={() => addSkill('soft', newSoft)}
                disabled={isSaving}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
              >
                Add
              </button>
            </div>
            {renderList('soft', softSkills)}
          </section>
        </div>
      )}
    </div>
  );
}
