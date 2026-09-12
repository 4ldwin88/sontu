export type ProfileProjection = {
  displayName: string;
  username: string;
  bio: string;
  provenance: "local_fixture";
};
export const initialProfile: ProfileProjection = {
  displayName: "Jay Nguyen",
  username: "jay",
  bio: "Good company, new places, and shared experiences.",
  provenance: "local_fixture",
};
