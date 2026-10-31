import { supabase } from "../database/supabase.js";

/**
 * Service for managing Telegram groups in BD Ping.
 */
export const groupService = {
  /**
   * Upserts a Telegram group record upon interaction.
   * Ensures the group exists before birthday or session registrations.
   * @param {{ id: number, title?: string, type: string }} chat Telegram chat object
   * @returns {Promise<{ id: number, title: string, type: string, timezone: string, is_active: boolean }>}
   */
  async ensureGroupExists(chat) {
    if (!chat || !chat.id) {
      throw new Error("Invalid chat object provided to ensureGroupExists.");
    }

    const title = chat.title || `Group ${chat.id}`;
    const type = chat.type === "supergroup" ? "supergroup" : "group";

    const { data, error } = await supabase
      .from("groups")
      .upsert(
        {
          id: chat.id,
          title,
          type,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select("id, title, type, timezone, announcement_time, leap_year_policy, is_active")
      .single();

    if (error) {
      throw new Error(`Failed to ensure group exists: ${error.message}`);
    }

    return data;
  },

  /**
   * Retrieves group metadata by Telegram chat ID.
   * @param {number} groupId 
   * @returns {Promise<{ id: number, title: string, timezone: string, is_active: boolean } | null>}
   */
  async getGroupById(groupId) {
    const { data, error } = await supabase
      .from("groups")
      .select("id, title, timezone, announcement_time, leap_year_policy, is_active")
      .eq("id", groupId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to retrieve group: ${error.message}`);
    }

    return data;
  },

  /**
   * Marks a group as inactive when the bot is kicked or removed.
   * @param {number} groupId 
   * @returns {Promise<void>}
   */
  async deactivateGroup(groupId) {
    const { error } = await supabase
      .from("groups")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", groupId);

    if (error) {
      throw new Error(`Failed to deactivate group: ${error.message}`);
    }
  },

  /**
   * Checks if a specific user is a verified active member of a specific group.
   * Uses Telegram Bot API getChatMember.
   * @param {object} botApi grammY bot.api instance
   * @param {number} groupId 
   * @param {number} userId 
   * @returns {Promise<boolean>}
   */
  async isUserInGroup(botApi, groupId, userId) {
    try {
      const member = await botApi.getChatMember(groupId, userId);
      const validStatuses = ["creator", "administrator", "member", "restricted"];
      if (validStatuses.includes(member.status)) {
        if (member.status === "restricted" && member.is_member === false) {
          return false;
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  /**
   * Checks if a user is an administrator or owner of a group.
   * @param {object} botApi grammY bot.api instance
   * @param {number} groupId 
   * @param {number} userId 
   * @returns {Promise<boolean>}
   */
  async isGroupAdmin(botApi, groupId, userId) {
    try {
      const member = await botApi.getChatMember(groupId, userId);
      return member.status === "creator" || member.status === "administrator";
    } catch {
      return false;
    }
  },
};
