import type { Staff, StaffStoreAssignment, Store } from "../domain/entities";

export function selectCounterStaff(
  activeStaff: Staff[],
  principalStaffId: string | null,
  selectedStaffId: string,
): Staff | null {
  const principalStaff = principalStaffId
    ? activeStaff.find((staff) => staff.id === principalStaffId)
    : undefined;
  if (principalStaff) return principalStaff;
  if (selectedStaffId) return activeStaff.find((staff) => staff.id === selectedStaffId) ?? null;
  return activeStaff.length === 1 ? activeStaff[0] : null;
}

export function eligibleCounterStores(
  staff: Staff,
  stores: Store[],
  assignments: StaffStoreAssignment[],
  activeStoreStatusId: string,
  activeAssignmentStatusId: string,
): { primary: Store | null; assigned: Store[] } {
  const activeStores = stores.filter(
    (store) => !store.isDeleted && store.storeStatusId === activeStoreStatusId,
  );
  const primary = activeStores.find((store) => store.id === staff.storeId) ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const assignedIds = new Set(
    assignments
      .filter(
        (assignment) =>
          !assignment.isDeleted &&
          assignment.staffId === staff.id &&
          assignment.assignmentStatusId === activeAssignmentStatusId &&
          assignment.effectiveDate.slice(0, 10) <= today &&
          (!assignment.endDate || assignment.endDate.slice(0, 10) >= today),
      )
      .map((assignment) => assignment.storeId),
  );
  return {
    primary,
    assigned: activeStores.filter((store) => assignedIds.has(store.id)),
  };
}
