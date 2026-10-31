export interface ExpansionPreparationGate {
  preparation_id: string;
  review_id: string;
  decision_id: string;
  preparation_status: string;
}

export interface CandidateParticipantDraft {
  candidate_id: number;
  segment_id: number;
  candidate_status: string;
}

export interface DraftInviteBatch {
  batch_id: number;
  draft_invite_status: string;
}
