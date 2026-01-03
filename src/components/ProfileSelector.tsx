/**
 * Profile Selector - Dropdown for switching simulation profiles
 *
 * Displays available profiles and dispatches profile/switched event on selection.
 * Uses profileStore for profile data and runtimeController for event dispatch.
 */

import { useResource } from "@/systems/standard.ts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconWorld } from "@tabler/icons-react";

export function ProfileSelector() {
  const profileStore = useResource("profileStore");
  const runtimeController = useResource("runtimeController");

  // Get active profile ID from profile store
  const activeProfileId = profileStore.useStore(
    (state) => state.profiles.data.activeProfileId,
  );

  // Get all available profiles
  const allProfiles = profileStore.getAllProfiles();

  const handleProfileChange = (profileId: string) => {
    // Dispatch profile/switched event
    runtimeController.dispatch({
      type: "profile/switched",
      profileId,
    });

    // Update profile store to reflect new active profile
    profileStore.setActiveProfile(profileId);
  };

  // Find current profile info for display
  const currentProfile = allProfiles.find((p) => p.id === activeProfileId);

  return (
    <div className="flex items-center gap-2">
      <IconWorld size={16} className="text-primary/70" />
      <Select
        value={activeProfileId}
        onValueChange={(value) => handleProfileChange(value || "")}
      >
        <SelectTrigger size="sm" className="w-[200px]">
          <SelectValue>
            <span className="font-semibold text-primary">
              {currentProfile?.name || "Select Profile"}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {allProfiles.map((profile) => (
            <SelectItem key={profile.id} value={profile.id}>
              <div className="flex flex-col">
                <span className="font-medium">{profile.name}</span>
                <span className="text-[10px] text-muted-foreground line-clamp-1">
                  {profile.description}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
