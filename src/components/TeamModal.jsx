import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  ArrowLeft,
  Copy,
  Trash2,
  LogOut,
  Settings,
  Users,
  Check,
  Link,
} from 'lucide-react';
import {
  getTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  getTeamMembers,
  leaveTeam,
  generateInviteLink,
  removeMember,
} from '@/modules/team-manager';
import { toast } from 'sonner';

export function TeamModal({
  isOpen,
  onClose,
  currentTeam,
  teams = [],
  initialTeamId = null,
  initialView = 'list',
  onTeamsUpdated,
  onSelectTeam,
}) {
  const [view, setView] = useState('list'); // 'list', 'edit', 'details'
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamNameInput, setTeamNameInput] = useState('');
  const [teamDivisionInput, setTeamDivisionInput] = useState('10U');
  const [members, setMembers] = useState([]);
  const [inviteRole, setInviteRole] = useState('coach');
  const [inviteLink, setInviteLink] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const ownerCount = members.filter((m) => m.role === 'owner').length;
  const isOwner = selectedTeam?.role === 'owner';
  const canLeave = !isOwner || ownerCount > 1;
  const canDelete = isOwner;

  const loadTeamDetails = async (team) => {
    setSelectedTeam(team);
    setTeamNameInput(team.name);
    setTeamDivisionInput(team.ageDivision || '10U');
    setInviteLink('');
    setView('details');

    try {
      const res = await getTeamMembers(team.id);
      if (res.success) {
        setMembers(res.data || []);
      }
    } catch (e) {
      console.error('Failed to load team members:', e);
    }
  };

  // Only the opening of the dialog picks the view. `teams` is in the deps so a
  // list that arrives late still resolves initialTeamId, but a refresh after
  // saving must not throw the form away and reopen it empty.
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;

    if (initialTeamId) {
      const team = teams.find((t) => t.id === initialTeamId);
      if (team) {
        loadTeamDetails(team);
        return;
      }
    }
    if (!justOpened) return;

    setInviteLink('');
    if (initialView === 'create') {
      handleCreateNew();
      return;
    }
    setView('list');
  }, [isOpen, initialTeamId, initialView, teams]);

  const handleCreateNew = () => {
    setSelectedTeam(null);
    setTeamNameInput('');
    setTeamDivisionInput('10U');
    setView('edit');
  };

  const handleSaveTeam = async (e) => {
    e.preventDefault();
    if (!teamNameInput.trim()) return;

    setIsSubmitting(true);
    try {
      if (selectedTeam) {
        // Update existing team
        const res = await updateTeam(selectedTeam.id, {
          name: teamNameInput.trim(),
          ageDivision: teamDivisionInput,
        });
        if (res.success) {
          toast.success('Team updated successfully');
          onTeamsUpdated();
          setView('list');
        } else {
          toast.error(res.error || 'Failed to update team');
        }
      } else {
        // Create new team
        const res = await createTeam(teamNameInput.trim(), teamDivisionInput);
        if (res.success) {
          toast.success('Team created successfully');
          onTeamsUpdated();
          if (res.data?.id) {
            onSelectTeam(res.data.id);
          }
          setView('list');
        } else {
          toast.error(res.error || 'Failed to create team');
        }
      }
    } catch (error) {
      toast.error('An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateInvite = async () => {
    if (!selectedTeam) return;
    try {
      const res = await generateInviteLink(selectedTeam.id, inviteRole);
      if (res.success && res.data?.inviteUrl) {
        setInviteLink(res.data.inviteUrl);
        toast.success('Invite link generated');
      } else {
        toast.error(res.error || 'Failed to generate invite');
      }
    } catch (e) {
      toast.error('Failed to generate invite');
    }
  };

  const handleCopyInvite = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      toast.success('Invite link copied to clipboard!');
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!selectedTeam) return;
    if (!confirm('Are you sure you want to remove this member?')) return;

    try {
      const res = await removeMember(selectedTeam.id, memberId);
      if (res.success) {
        toast.success('Member removed');
        setMembers((prev) => prev.filter((m) => m.id !== memberId));
      } else {
        toast.error(res.error || 'Failed to remove member');
      }
    } catch (e) {
      toast.error('Failed to remove member');
    }
  };

  const handleLeaveTeam = async () => {
    if (!selectedTeam) return;
    if (!confirm(`Are you sure you want to leave ${selectedTeam.name}?`)) return;

    try {
      const res = await leaveTeam(selectedTeam.id);
      if (res.success) {
        toast.success(`Left ${selectedTeam.name}`);
        onTeamsUpdated();
        setView('list');
      } else {
        toast.error(res.error || 'Failed to leave team');
      }
    } catch (e) {
      toast.error('Failed to leave team');
    }
  };

  const handleDeleteTeam = async () => {
    if (!selectedTeam) return;
    if (!confirm(`Are you sure you want to PERMANENTLY delete ${selectedTeam.name}? This will remove all roster data and game history for all members.`)) return;

    try {
      const res = await deleteTeam(selectedTeam.id);
      if (res.success) {
        toast.success('Team deleted');
        onTeamsUpdated();
        setView('list');
      } else {
        toast.error(res.error || 'Failed to delete team');
      }
    } catch (e) {
      toast.error('Failed to delete team');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" id="teamModal">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold" id="teamModalTitle">
            {view === 'list' && 'Manage Teams'}
            {view === 'edit' && (selectedTeam ? 'Edit Team' : 'Create New Team')}
            {view === 'details' && (selectedTeam?.name || 'Team Details')}
          </DialogTitle>
        </DialogHeader>

        {/* View 1: Teams List */}
        {view === 'list' && (
          <div className="space-y-4 py-2" id="teamListView">
            <div className="space-y-2 max-h-64 overflow-y-auto" id="teamList">
              {teams.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No teams found. Create your first team below.
                </p>
              ) : (
                teams.map((team) => {
                  const isCurrent = currentTeam?.id === team.id;
                  return (
                    <div
                      key={team.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors"
                    >
                      <div
                        className="flex-1 cursor-pointer"
                        onClick={() => {
                          onSelectTeam(team.id);
                          onClose();
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {team.name}
                          </span>
                          {isCurrent && (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0">
                              Active
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{team.ageDivision || '10U'}</span>
                          <span>•</span>
                          <span className="capitalize">{team.role || 'coach'}</span>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => loadTeamDetails(team)}
                        className="h-8 w-8 text-muted-foreground"
                        title="Team settings & members"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>

            <Button
              type="button"
              id="createTeamBtn"
              onClick={handleCreateNew}
              className="w-full flex items-center justify-center gap-2 text-xs"
            >
              <Plus className="h-4 w-4" />
              Create New Team
            </Button>
          </div>
        )}

        {/* View 2: Create / Edit Form */}
        {view === 'edit' && (
          <form onSubmit={handleSaveTeam} className="space-y-4 py-2" id="teamEditView">
            <div className="space-y-1.5">
              <Label htmlFor="teamNameInput" className="text-xs text-muted-foreground">
                Team Name:
              </Label>
              <Input
                type="text"
                id="teamNameInput"
                placeholder="e.g., Strikers FC"
                maxLength={50}
                value={teamNameInput}
                onChange={(e) => setTeamNameInput(e.target.value)}
                className="text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="teamDivision" className="text-xs text-muted-foreground">
                Age Division:
              </Label>
              <Select value={teamDivisionInput} onValueChange={setTeamDivisionInput}>
                <SelectTrigger id="teamDivision" className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10U">10U</SelectItem>
                  <SelectItem value="12U">12U</SelectItem>
                  <SelectItem value="14U">14U</SelectItem>
                  <SelectItem value="16U">16U</SelectItem>
                  <SelectItem value="19U">19U</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                id="cancelTeamEdit"
                onClick={() => setView('list')}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                id="saveTeamBtn"
                disabled={isSubmitting}
                className="text-xs"
              >
                {isSubmitting ? 'Saving...' : 'Save Team'}
              </Button>
            </div>
          </form>
        )}

        {/* View 3: Team Details & Members */}
        {view === 'details' && selectedTeam && (
          <div className="space-y-4 py-2" id="teamDetailsView">
            {/* Members Section */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Team Members
              </h4>
              <div className="space-y-1.5 max-h-36 overflow-y-auto" id="memberList">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/40 text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={member.avatarUrl} alt="" />
                        <AvatarFallback>
                          {(member.displayName || member.email || 'U').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="truncate">
                        <p className="font-medium text-foreground truncate">
                          {member.displayName || member.email}
                        </p>
                        <p className="text-[10px] text-muted-foreground capitalize">
                          {member.role}
                        </p>
                      </div>
                    </div>

                    {selectedTeam.role === 'owner' && member.role !== 'owner' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveMember(member.id)}
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        title="Remove member"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Invite Section */}
            {selectedTeam.role === 'owner' && (
              <div className="space-y-2 pt-2 border-t">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Invite Coach
                </h4>
                <div className="flex items-center gap-2">
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger id="inviteRole" className="h-8 text-xs w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="coach">Coach (can edit)</SelectItem>
                      <SelectItem value="viewer">Viewer (read only)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    id="generateInviteLink"
                    onClick={handleGenerateInvite}
                    className="h-8 text-xs flex items-center gap-1"
                  >
                    <Link className="h-3.5 w-3.5" />
                    Generate Link
                  </Button>
                </div>

                {inviteLink && (
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      type="text"
                      readOnly
                      value={inviteLink}
                      id="inviteLinkInput"
                      className="h-8 text-xs font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      id="copyInviteLink"
                      onClick={handleCopyInvite}
                      className="h-8 px-2 text-xs"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                id="backToTeamList"
                onClick={() => setView('list')}
                className="text-xs flex items-center gap-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </Button>

              <div className="flex items-center gap-1.5">
                {selectedTeam.role === 'owner' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    id="editTeamBtn"
                    onClick={() => setView('edit')}
                    className="text-xs"
                  >
                    Edit
                  </Button>
                )}

                {canLeave && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    id="leaveTeamBtn"
                    onClick={handleLeaveTeam}
                    className="text-xs"
                  >
                    Leave Team
                  </Button>
                )}

                {canDelete && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    id="deleteTeamBtn"
                    onClick={handleDeleteTeam}
                    className="text-xs"
                  >
                    Delete Team
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
