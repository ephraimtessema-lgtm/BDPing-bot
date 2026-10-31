import { supabase } from "../database/supabase.js";

/**
 * Service for birthday CRUD operations with strict multi-group isolation.
 */
export const birthdayService = {
  /**
   * Registers a birthday directly for a user in a specific group.
   * Checks for existing registration to prevent overwriting.
   * @param {object} params
   * @param {number} params.groupId 
   * @param {number} params.telegramUserId 
   * @param {string} params.name 
   * @param {string} [params.username] 
   * @param {number} params.birthMonth 
   * @param {number} params.birthDay 
   * @returns {Promise<{ success: boolean, birthday?: any, error?: string, existingMonth?: number, existingDay?: number }>}
   */
  async registerBirthday({ groupId, telegramUserId, name, username, birthMonth, birthDay }) {
    // 1. Check if user is already registered in this group
    const { data: existing, error: checkError } = await supabase
      .from("birthdays")
      .select("id, birth_month, birth_day")
      .eq("group_id", groupId)
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();

    if (checkError) {
      throw new Error(`Database error checking birthday: ${checkError.message}`);
    }

    if (existing) {
      return {
        success: false,
        error: "ALREADY_REGISTERED",
        existingMonth: existing.birth_month,
        existingDay: existing.birth_day,
      };
    }

    // 2. Insert new birthday record
    const { data, error } = await supabase
      .from("birthdays")
      .insert({
        group_id: groupId,
        telegram_user_id: telegramUserId,
        name,
        username: username || null,
        birth_month: birthMonth,
        birth_day: birthDay,
      })
      .select("id, group_id, telegram_user_id, name, username, birth_month, birth_day, created_at")
      .single();

    if (error) {
      if (error.code === "23505") { // Unique constraint violation (race condition safe)
        return {
          success: false,
          error: "ALREADY_REGISTERED",
        };
      }
      throw new Error(`Failed to insert birthday: ${error.message}`);
    }

    return {
      success: true,
      birthday: data,
    };
  },

  /**
   * Retrieves a user's birthday in a specific group.
   * @param {number} groupId 
   * @param {number} telegramUserId 
   * @returns {Promise<any | null>}
   */
  async getByUserAndGroup(groupId, telegramUserId) {
    const { data, error } = await supabase
      .from("birthdays")
      .select("id, group_id, telegram_user_id, name, username, birth_month, birth_day, created_at, updated_at")
      .eq("group_id", groupId)
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch birthday: ${error.message}`);
    }

    return data;
  },

  /**
   * Updates an existing registered birthday for a user in a specific group.
   * @param {number} groupId 
   * @param {number} telegramUserId 
   * @param {{ name?: string, username?: string, birthMonth: number, birthDay: number }} data 
   * @returns {Promise<{ success: boolean, birthday?: any, error?: string }>}
   */
  async updateByUserAndGroup(groupId, telegramUserId, { name, username, birthMonth, birthDay }) {
    const updatePayload = {
      birth_month: birthMonth,
      birth_day: birthDay,
      updated_at: new Date().toISOString(),
    };

    if (name) updatePayload.name = name;
    if (username !== undefined) updatePayload.username = username || null;

    const { data, error } = await supabase
      .from("birthdays")
      .update(updatePayload)
      .eq("group_id", groupId)
      .eq("telegram_user_id", telegramUserId)
      .select("id, group_id, telegram_user_id, name, username, birth_month, birth_day, updated_at")
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to update birthday: ${error.message}`);
    }

    if (!data) {
      return { success: false, error: "NOT_FOUND" };
    }

    return { success: true, birthday: data };
  },

  /**
   * Deletes a user's registered birthday in a specific group.
   * @param {number} groupId 
   * @param {number} telegramUserId 
   * @returns {Promise<{ success: boolean, deleted: boolean }>}
   */
  async deleteByUserAndGroup(groupId, telegramUserId) {
    const { data, error } = await supabase
      .from("birthdays")
      .delete()
      .eq("group_id", groupId)
      .eq("telegram_user_id", telegramUserId)
      .select("id");

    if (error) {
      throw new Error(`Failed to delete birthday: ${error.message}`);
    }

    return {
      success: true,
      deleted: Boolean(data && data.length > 0),
    };
  },

  /**
   * Lists all birthdays registered in a specific group, ordered chronologically.
   * Strictly isolated to the requested groupId.
   * @param {number} groupId 
   * @returns {Promise<Array<{ id: string, name: string, username?: string, birth_month: number, birth_day: number }>>}
   */
  async listByGroup(groupId) {
    const { data, error } = await supabase
      .from("birthdays")
      .select("id, name, username, birth_month, birth_day")
      .eq("group_id", groupId)
      .order("birth_month", { ascending: true })
      .order("birth_day", { ascending: true });

    if (error) {
      throw new Error(`Failed to list group birthdays: ${error.message}`);
    }

    return data || [];
  },

  /**
   * Retrieves all members in a group with birthdays on a specific month and day.
   * @param {number} groupId 
   * @param {number} month 
   * @param {number} day 
   * @returns {Promise<Array<{ id: string, group_id: number, telegram_user_id: number, name: string, username?: string, birth_month: number, birth_day: number }>>}
   */
  async getBirthdaysByDate(groupId, month, day) {
    const { data, error } = await supabase
      .from("birthdays")
      .select("id, group_id, telegram_user_id, name, username, birth_month, birth_day")
      .eq("group_id", groupId)
      .eq("birth_month", month)
      .eq("birth_day", day)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch birthdays for date: ${error.message}`);
    }

    return data || [];
  },

  /**
   * Lists all groups where a user has registered a birthday.
   * Used for private chat management across multiple groups.
   * @param {number} telegramUserId 
   * @returns {Promise<Array<{ id: string, groupId: number, groupTitle: string, birthMonth: number, birthDay: number, name: string }>>}
   */
  async listUserRegistrationsAcrossGroups(telegramUserId) {
    const { data, error } = await supabase
      .from("birthdays")
      .select("id, group_id, birth_month, birth_day, name, groups (title)")
      .eq("telegram_user_id", telegramUserId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch user registrations: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id,
      groupId: row.group_id,
      groupTitle: row.groups?.title || `Group ${row.group_id}`,
      birthMonth: row.birth_month,
      birthDay: row.birth_day,
      name: row.name,
    }));
  },
};
