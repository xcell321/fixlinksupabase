import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Alert, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Skeleton from '../../components/Skeleton';
import { cancelRepairRequest, confirmRepairRequest, fetchCompletedJobs, fetchCustomerRequests, fetchTechnicianRecommendations, markCustomerReady, submitTechnicianReview } from '../services/api';
import { fonts } from '../../theme';
import { getApplianceIcon, getStatusColor, getStatusIcon } from '../../utils/applianceIcons';

const colors = { ink: '#102A43', teal: '#0F766E', tealLight: '#E6F6F3', green: '#059669', canvas: '#F5F8FA', white: '#FFFFFF', muted: '#5A7A91', line: '#D9E2EC', error: '#E53935' };

export default function RequestProgressScreen({ customerName, customerUid, acceptedOnly = false, onViewDetails, onTrackMap, onViewTechnicianProfile, onMessageTechnician }) {
  const [completedJobs, setCompletedJobs] = useState([]);
  const [trackedRequests, setTrackedRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState(acceptedOnly ? 'active' : 'all');
  const [reviewRatings, setReviewRatings] = useState({});
  const [reviewComments, setReviewComments] = useState({});
  const [reviewSubmitting, setReviewSubmitting] = useState(null);
  const [expandedReviewId, setExpandedReviewId] = useState(null);
  const [recommendations, setRecommendations] = useState({});
  const [recommendationsRefresh, setRecommendationsRefresh] = useState({});
  const [recStates, setRecStates] = useState({});
  const recommendationsFetched = useRef({});

  const fetchAll = () => Promise.all([
    fetchCompletedJobs(customerName).then(setCompletedJobs).catch(() => setCompletedJobs([])),
    fetchCustomerRequests(customerName, customerUid).then(setTrackedRequests).catch(() => setTrackedRequests([])),
  ]);

  useEffect(() => {
    setStatusFilter(acceptedOnly ? 'active' : 'all');
  }, [acceptedOnly]);

  useEffect(() => {
    let active = true;
    const refreshStatuses = () => fetchAll().finally(() => { if (active) setLoadingRequests(false); });
    refreshStatuses();
    const interval = setInterval(refreshStatuses, 45000);
    return () => { active = false; clearInterval(interval); };
  }, [customerName, customerUid]);

  const handleRefresh = async () => {
    recommendationsFetched.current = {};
    setRecommendations({});
    setRecStates({});
    setRecommendationsRefresh({ run: Date.now() });
    setRefreshing(true);
    try {
      await fetchAll();
    } finally {
      setRefreshing(false);
    }
  };

  const pendingRequests = trackedRequests.filter((r) => (r.status || '').toLowerCase() === 'pending');
  const activeRequests = trackedRequests.filter((r) => ['accepted', 'confirmed', 'customer ready', 'in progress'].includes((r.status || '').toLowerCase()));
  const totalCount = trackedRequests.length + completedJobs.length;

  // Fetch AI recommendations once per pending job (cache by request id so the
  // 45s poll never re-calls the AI gateway for the same request). Each pending
  // request tracks its own loading / loaded / empty / error state so the panel
  // communicates exactly what is happening.
  const pendingIds = pendingRequests.map((r) => r.id).join(',');
  useEffect(() => {
    pendingRequests.forEach(async (request) => {
      if (!request.id || recommendationsFetched.current[request.id]) return;
      recommendationsFetched.current[request.id] = true;
      setRecStates((current) => ({ ...current, [request.id]: 'loading' }));
      try {
        const data = await fetchTechnicianRecommendations(request.id);
        if (Array.isArray(data?.recommendations)) {
          setRecommendations((current) => ({ ...current, [request.id]: data }));
          setRecStates((current) => ({ ...current, [request.id]: data.recommendations.length ? 'loaded' : 'empty' }));
        } else {
          setRecStates((current) => ({ ...current, [request.id]: 'empty' }));
        }
      } catch (_) {
        setRecStates((current) => ({ ...current, [request.id]: 'error' }));
      }
    });
  }, [pendingIds, recommendationsRefresh]);

  const handleCancelRequest = (requestId) => {
    Alert.alert('Cancel request?', 'This can only be done before a technician accepts the request.', [
      { text: 'Keep request', style: 'cancel' },
      { text: 'Cancel request', style: 'destructive', onPress: async () => {
        try {
          await cancelRepairRequest(requestId);
          fetchAll();
          setTrackedRequests((current) => current.map((request) => request.id === requestId ? { ...request, status: 'Cancelled' } : request));
        } catch (error) {
          Alert.alert('Unable to cancel', error?.error || 'The request could not be cancelled.');
        }
      } },
    ]);
  };

  const handleReviewSubmit = async (jobId) => {
    if (!reviewRatings[jobId]) {
      Alert.alert('Error', 'Please select a rating before submitting.');
      return;
    }
    setReviewSubmitting(jobId);
    try {
      await submitTechnicianReview(jobId, { customerName, rating: reviewRatings[jobId], comment: reviewComments[jobId] });
      Alert.alert('Success', 'Review submitted successfully!');
      setExpandedReviewId(null);
      await fetchAll();
    } catch (error) {
      Alert.alert('Error', 'Failed to submit review.');
    } finally {
      setReviewSubmitting(null);
    }
  };

  const filterOptions = [
    { key: 'all', label: 'All', count: totalCount },
    { key: 'pending', label: 'Pending', count: pendingRequests.length },
    { key: 'active', label: 'Active', count: activeRequests.length },
    { key: 'completed', label: 'Completed', count: completedJobs.length },
  ];

  const showPending = statusFilter === 'all' || statusFilter === 'pending';
  const showActive = statusFilter === 'all' || statusFilter === 'active';
  const showCompleted = statusFilter === 'all' || statusFilter === 'completed';

  const renderStatusPill = (status) => (
    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) + '15', borderColor: getStatusColor(status) + '40' }]}>
      <Ionicons name={getStatusIcon(status)} size={11} color={getStatusColor(status)} />
      <Text style={[styles.statusText, { color: getStatusColor(status) }]}>{status}</Text>
    </View>
  );

  const renderMetaItem = (icon, text) => (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={14} color={colors.muted} />
      <Text style={styles.metaText} numberOfLines={1}>{text}</Text>
    </View>
  );

  const renderRequestCard = (req) => {
    const statusKey = String(req.status || '').toLowerCase();
    const isPending = statusKey === 'pending';
    const isAccepted = statusKey === 'accepted';
    const isConfirmed = statusKey === 'confirmed';
    const isReady = statusKey === 'customer ready';
    const isActive = isAccepted || isConfirmed || isReady || statusKey === 'in progress';
    return (
      <View key={req.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconChip, isActive ? styles.iconChipBlue : styles.iconChipAmber]}>
            <Ionicons name={getApplianceIcon(req.applianceType)} size={22} color={isActive ? '#2563EB' : '#D97706'} />
          </View>
          <View style={styles.cardHeaderCopy}>
            <Text style={styles.applianceTitle} numberOfLines={1}>{req.applianceType}</Text>
            <Text style={styles.subLabel} numberOfLines={1}>
              {req.technicianName
                ? `Tech: ${req.technicianName}`
                : isPending
                  ? 'Awaiting technician match'
                  : 'Matching you with a technician'}
            </Text>
          </View>
          {renderStatusPill(req.status)}
        </View>

        <Text style={styles.description} numberOfLines={2}>{req.description}</Text>

        <View style={styles.metaRow}>
          {renderMetaItem('calendar-outline', new Date(req.createdAt).toLocaleDateString())}
          {renderMetaItem('location-outline', req.location)}
        </View>

        {isPending && (
          <View style={styles.aiPanel}>
            <View style={styles.aiPanelHeader}>
              <Ionicons name="sparkles" size={15} color={colors.teal} />
              <Text style={styles.aiPanelTitle}>AI Recommended Technicians</Text>
            </View>
            {renderAiPanelBody(req)}
          </View>
        )}

        {isConfirmed && (
          <View style={styles.miniCodeBadge}>
            <Ionicons name="key" size={14} color="#059669" />
            <Text style={styles.miniCodeText}>
              Arrival Code: <Text style={styles.miniCodeHighlight}>{req.arrivalCode}</Text>
            </Text>
          </View>
        )}

        {isReady && (
          <View style={[styles.miniCodeBadge, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}>
            <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />
            <Text style={[styles.miniCodeText, { color: '#5B21B6' }]}>Ready for your technician</Text>
          </View>
        )}

        {isActive && req.verificationCode && !isConfirmed && (
          <View style={styles.miniCodeBadge}>
            <Ionicons name="key" size={14} color="#059669" />
            <Text style={styles.miniCodeText}>
              Completion Code: <Text style={styles.miniCodeHighlight}>{req.verificationCode}</Text>
            </Text>
          </View>
        )}

        <View style={styles.cardActionsRow}>
          {isActive && onTrackMap && (
            <TouchableOpacity style={styles.trackMapCardButton} onPress={() => onTrackMap(req)} activeOpacity={0.85}>
              <Ionicons name="map" size={15} color={colors.white} style={{ marginRight: 6 }} />
              <Text style={styles.trackMapCardText}>Track</Text>
            </TouchableOpacity>
          )}
          {isAccepted && (
            <TouchableOpacity
              style={[styles.trackMapCardButton, { backgroundColor: '#7C3AED' }]}
              onPress={() => Alert.alert('Confirm repair?', 'This confirms you need the repair and will be at the service location.', [
                { text: 'Not yet', style: 'cancel' },
                { text: 'Confirm', onPress: async () => {
                  try {
                    await confirmRepairRequest(req.id);
                    fetchAll();
                    setTrackedRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: 'Confirmed' } : r));
                  } catch (error) {
                    Alert.alert('Unable to confirm', error?.error || 'Please try again.');
                  }
                } },
              ])}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark" size={15} color={colors.white} style={{ marginRight: 6 }} />
              <Text style={styles.trackMapCardText}>Confirm</Text>
            </TouchableOpacity>
          )}
          {isConfirmed && (
            <TouchableOpacity
              style={[styles.trackMapCardButton, { backgroundColor: '#0F766E' }]}
              onPress={() => Alert.alert('Mark ready?', 'Confirm that someone will be at the service location to meet the technician.', [
                { text: 'Not yet', style: 'cancel' },
                { text: 'Ready', onPress: async () => {
                  try {
                    await markCustomerReady(req.id);
                    fetchAll();
                    setTrackedRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: 'Customer Ready' } : r));
                  } catch (error) {
                    Alert.alert('Unable to mark ready', error?.error || 'Please try again.');
                  }
                } },
              ])}
              activeOpacity={0.85}
            >
              <Ionicons name="flag" size={15} color={colors.white} style={{ marginRight: 6 }} />
              <Text style={styles.trackMapCardText}>I'm Ready</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.viewDetailsButton} onPress={() => onViewDetails(req)} activeOpacity={0.85}>
            <Ionicons name="eye-outline" size={16} color={colors.teal} style={{ marginRight: 6 }} />
            <Text style={styles.viewDetailsText}>Details</Text>
          </TouchableOpacity>
          {(isPending || isAccepted || isConfirmed || isReady) && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                const message = isPending
                  ? 'This can only be done before a technician accepts the request.'
                  : isReady
                    ? 'Cancel now before the technician starts the repair. This will be recorded for review.'
                    : isConfirmed
                      ? 'Cancel now before the technician travels.'
                      : 'Cancel now before marking the request ready.';
                Alert.alert('Cancel request?', message, [
                  { text: 'Keep request', style: 'cancel' },
                  { text: 'Cancel request', style: 'destructive', onPress: async () => {
                    try {
                      await cancelRepairRequest(req.id);
                      fetchAll();
                      setTrackedRequests((current) => current.map((request) => request.id === req.id ? { ...request, status: 'Cancelled' } : request));
                    } catch (error) {
                      Alert.alert('Unable to cancel', error?.error || 'The request could not be cancelled.');
                    }
                  } },
                ]);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const recStateOf = (requestId) => recStates[requestId] || 'loading';

  const renderTechCard = (req, tech) => (
    <View key={tech.uid} style={styles.techCard}>
      <View style={styles.techTopRow}>
        {tech.profileImage ? (
          <Image source={{ uri: tech.profileImage }} style={styles.techAvatarImg} />
        ) : (
          <View style={styles.techAvatar}>
            <Text style={styles.techAvatarText}>{(tech.name || 'T').charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.techCopy}>
          <Text style={styles.techName} numberOfLines={1}>{tech.name}</Text>
          <View style={styles.matchBadge}>
            <Text style={styles.matchBadgeValue}>{Math.round((tech.matchScore || 0) * 100)}%</Text>
            <Text style={styles.matchBadgeLabel}>match</Text>
          </View>
        </View>
        {tech.confidence ? <Text style={styles.techConfidence}>{Math.round(tech.confidence * 100)}% AI</Text> : null}
      </View>

      <Text style={styles.techReason} numberOfLines={2}>{tech.reason}</Text>

      <View style={styles.techMetaRow}>
        <View style={styles.techMetaItem}>
          <Ionicons name="star" size={13} color="#F59E0B" />
          <Text style={styles.techMetaText}>{tech.rating ? Number(tech.rating).toFixed(1) : '—'}</Text>
        </View>
        <View style={styles.techMetaItem}>
          <Ionicons name="people-outline" size={13} color={colors.muted} />
          <Text style={styles.techMetaText}>{tech.totalReviews || 0} review{tech.totalReviews === 1 ? '' : 's'}</Text>
        </View>
        <View style={styles.techMetaItem}>
          <Ionicons name="briefcase-outline" size={13} color={colors.muted} />
          <Text style={styles.techMetaText}>{tech.yearsExperience || 0} yr{tech.yearsExperience === 1 ? '' : 's'}</Text>
        </View>
        {tech.distanceKm != null && (
          <View style={styles.techMetaItem}>
            <Ionicons name="location-outline" size={13} color={colors.muted} />
            <Text style={styles.techMetaText}>{tech.distanceKm} km</Text>
          </View>
        )}
      </View>

      {tech.skills?.length > 0 && (
        <View style={styles.techSkillsRow}>
          {tech.skills.slice(0, 3).map((skill) => (
            <View key={skill} style={styles.techSkillChip}>
              <Text style={styles.techSkillText} numberOfLines={1}>{skill}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.techActionsRow}>
        <TouchableOpacity style={styles.techProfileButton} onPress={() => onViewTechnicianProfile && onViewTechnicianProfile(tech)} activeOpacity={0.85}>
          <Ionicons name="person-outline" size={14} color={colors.teal} style={{ marginRight: 5 }} />
          <Text style={styles.techProfileButtonText}>View Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.techMessageButton} onPress={() => onMessageTechnician && onMessageTechnician(req, tech)} activeOpacity={0.85}>
          <Ionicons name="chatbubble-outline" size={14} color={colors.ink} style={{ marginRight: 5 }} />
          <Text style={styles.techMessageButtonText}>Message</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderAiPanelBody = (req) => {
    const data = recommendations[req.id];
    const recs = Array.isArray(data?.recommendations) ? data.recommendations : [];

    if (recs.length > 0) {
      return (
        <>
          <Text style={styles.aiPanelHint}>
            {data.ai === 'ai'
              ? 'Ranked from real ratings, reviews, experience, and proximity.'
              : 'Best available matches for this request.'}
          </Text>
          {recs.map((tech) => renderTechCard(req, tech))}
        </>
      );
    }

    const state = recStateOf(req.id);
    if (state === 'error') {
      return (
        <View style={styles.aiMessageRow}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.muted} />
          <Text style={styles.aiMessageText}>Recommendations are temporarily unavailable. Pull down to try again.</Text>
        </View>
      );
    }

    if (state === 'empty') {
      return (
        <View style={styles.aiMessageRow}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.muted} />
          <Text style={styles.aiMessageText}>{data?.note || 'No eligible technicians match this request yet.'}</Text>
        </View>
      );
    }

    return (
      <View style={styles.aiLoading}>
        <ActivityIndicator size="small" color={colors.teal} />
        <Text style={styles.aiLoadingText}>Analyzing your request for the best match...</Text>
      </View>
    );
  };

  const renderCompletedCard = (job) => {
    const expanded = expandedReviewId === job.id;
    return (
      <View key={job.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconChip, styles.iconChipGreen]}>
            <Ionicons name={getApplianceIcon(job.applianceType)} size={22} color="#059669" />
          </View>
          <View style={styles.cardHeaderCopy}>
            <Text style={styles.applianceTitle} numberOfLines={1}>{job.applianceType}</Text>
            <Text style={styles.subLabel} numberOfLines={1}>Completed by {job.technicianName || 'Assigned Tech'}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: '#05966915', borderColor: '#05966940' }]}>
            <Ionicons name="checkmark-circle" size={11} color="#059669" />
            <Text style={[styles.statusText, { color: '#059669' }]}>Done</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          {renderMetaItem('calendar-outline', new Date(job.completedAt || job.createdAt).toLocaleDateString())}
          {renderMetaItem('star-outline', reviewRatings[job.id] ? `${reviewRatings[job.id]} star${reviewRatings[job.id] > 1 ? 's' : ''} rating` : 'No rating yet')}
        </View>

        <TouchableOpacity
          style={styles.reviewToggle}
          onPress={() => setExpandedReviewId(expanded ? null : job.id)}
          activeOpacity={0.85}
        >
          <Ionicons name={expanded ? 'chevron-up' : 'star-outline'} size={16} color={colors.teal} style={{ marginRight: 7 }} />
          <Text style={styles.reviewToggleText}>{expanded ? 'Hide review form' : 'Write a review'}</Text>
        </TouchableOpacity>

        {expanded && (
          <View style={styles.reviewContainer}>
            <Text style={styles.inputLabel}>Rate your experience</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setReviewRatings({ ...reviewRatings, [job.id]: star })} style={styles.starTouchable}>
                  <Text style={[styles.star, reviewRatings[job.id] >= star && styles.selectedStar]}>★</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="chatbox-outline" size={20} color={colors.muted} style={styles.inputIcon} />
              <TextInput
                style={styles.reviewInput}
                placeholder="How was the service? (Optional)"
                placeholderTextColor={colors.muted}
                multiline
                onChangeText={(text) => setReviewComments({ ...reviewComments, [job.id]: text })}
              />
            </View>

            <TouchableOpacity
              style={styles.reviewButton}
              onPress={() => handleReviewSubmit(job.id)}
              disabled={reviewSubmitting === job.id}
              activeOpacity={0.85}
            >
              {reviewSubmitting === job.id ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Submit Review</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderSectionHeader = (kicker, title, count, color = colors.teal, hint) => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderCopy}>
        <Text style={styles.sectionKicker}>{kicker}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
        {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      </View>
      <View style={[styles.countBadge, { backgroundColor: color + '15' }]}>
        <Text style={[styles.countBadgeText, { color }]}>{count}</Text>
      </View>
    </View>
  );

  const renderSkeleton = () => (
    <View>
      {[1, 2, 3].map((item) => (
        <View key={item} style={styles.card}>
          <View style={styles.skeletonHeader}>
            <Skeleton style={{ width: 44, height: 44, borderRadius: 14 }} />
            <View style={styles.skeletonCopy}>
              <Skeleton style={{ width: '62%', height: 15, marginBottom: 8 }} />
              <Skeleton style={{ width: '40%', height: 11 }} />
            </View>
            <Skeleton style={{ width: 70, height: 22, borderRadius: 8 }} />
          </View>
          <Skeleton style={{ width: '92%', height: 13, marginBottom: 8 }} />
          <Skeleton style={{ width: '66%', height: 13, marginBottom: 16 }} />
          <View style={styles.skeletonMetaRow}>
            <Skeleton style={{ width: '34%', height: 12 }} />
            <Skeleton style={{ width: '42%', height: 12 }} />
          </View>
          <View style={styles.skeletonActions}>
            <Skeleton style={{ width: '46%', height: 42, borderRadius: 12 }} />
            <Skeleton style={{ width: '46%', height: 42, borderRadius: 12 }} />
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.teal} colors={[colors.teal]} />}
    >
      <View style={styles.sectionHeaderContainer}>
        <Text style={styles.kicker}>MY REQUESTS</Text>
        <Text style={styles.sectionTitle}>{acceptedOnly ? 'Active Requests' : 'Service Requests'}</Text>
        <Text style={styles.subtitle}>Track your repairs and rate completed work.</Text>
      </View>

      <View style={styles.segmentRow}>
        {filterOptions.map((option) => {
          const active = statusFilter === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => setStatusFilter(option.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>{option.label}</Text>
              <View style={[styles.segmentCount, active && styles.segmentCountActive]}>
                <Text style={[styles.segmentCountText, active && styles.segmentCountTextActive]}>{option.count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {loadingRequests ? (
        renderSkeleton()
      ) : trackedRequests.length === 0 && completedJobs.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="clipboard-outline" size={34} color={colors.teal} />
          </View>
          <Text style={styles.emptyTitle}>No requests yet</Text>
          <Text style={styles.emptyText}>Your repair requests and updates will appear here once you create one.</Text>
        </View>
      ) : (
        <>
          {showPending && (
            <>
              {renderSectionHeader('AWAITING MATCH', 'Pending Requests', pendingRequests.length, '#D97706', "We'll notify you the moment a technician accepts.")}
              {pendingRequests.length === 0 ? (
                <View style={styles.sectionEmpty}>
                  <Ionicons name="time-outline" size={20} color={colors.muted} />
                  <Text style={styles.sectionEmptyText}>No pending requests</Text>
                </View>
              ) : pendingRequests.map(renderRequestCard)}
            </>
          )}

          {showActive && (
            <>
              {renderSectionHeader('ONGOING', 'Active Jobs', activeRequests.length, '#2563EB', "Follow them live on the map and keep your phone close.")}
              {activeRequests.length === 0 ? (
                <View style={styles.sectionEmpty}>
                  <Ionicons name="hand-left-outline" size={20} color={colors.muted} />
                  <Text style={styles.sectionEmptyText}>No active jobs right now</Text>
                </View>
              ) : activeRequests.map(renderRequestCard)}
            </>
          )}

          {showCompleted && (
            <>
              {renderSectionHeader('FINISHED', 'Completed Repairs', completedJobs.length, colors.green, "Great job seeing it through — a quick review helps your technician.")}
              {completedJobs.length === 0 ? (
                <View style={styles.sectionEmpty}>
                  <Ionicons name="checkmark-done-outline" size={20} color={colors.muted} />
                  <Text style={styles.sectionEmptyText}>Completed repairs will appear here</Text>
                </View>
              ) : completedJobs.map(renderCompletedCard)}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 20, paddingBottom: 32, backgroundColor: colors.canvas, flexGrow: 1 },
  sectionHeaderContainer: { marginBottom: 14 },
  kicker: { color: colors.teal, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bold, marginBottom: 3 },
  sectionTitle: { fontSize: 22, fontFamily: fonts.bold, color: colors.ink },
  subtitle: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, marginTop: 4 },

  segmentRow: { flexDirection: 'row', gap: 6, marginBottom: 18 },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 38, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  segmentActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  segmentText: { color: colors.muted, fontSize: 11, fontFamily: fonts.semiBold },
  segmentTextActive: { color: colors.white },
  segmentCount: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  segmentCountActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  segmentCountText: { color: colors.muted, fontSize: 10, fontFamily: fonts.bold },
  segmentCountTextActive: { color: colors.white },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 4 },
  sectionHeaderCopy: { flex: 1 },
  sectionKicker: { color: colors.teal, fontSize: 9, letterSpacing: 1.4, fontFamily: fonts.bold, marginBottom: 2 },
  countBadge: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  countBadgeText: { fontSize: 12, fontFamily: fonts.extraBold },

  card: { backgroundColor: colors.white, borderRadius: 22, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: colors.line, shadowColor: '#102A43', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  iconChip: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  iconChipAmber: { backgroundColor: '#FFF8E7' },
  iconChipBlue: { backgroundColor: '#EBF2FF' },
  iconChipGreen: { backgroundColor: '#ECFDF5' },
  cardHeaderCopy: { flex: 1, marginRight: 8 },
  applianceTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  subLabel: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, marginTop: 2 },

  statusBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontSize: 11, fontFamily: fonts.bold },

  description: { fontSize: 13, color: colors.muted, marginBottom: 14, lineHeight: 19, fontFamily: fonts.regular },
  sectionHint: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular },
  metaRow: { flexDirection: 'row', gap: 14, marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  metaText: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, flex: 1 },

  miniCodeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#BBF7D0', marginBottom: 12, gap: 6 },
  miniCodeText: { fontSize: 12, color: '#065F46', fontFamily: fonts.semiBold },
  miniCodeHighlight: { fontSize: 15, fontFamily: fonts.extraBold, color: '#059669', letterSpacing: 2 },

  cardActionsRow: { flexDirection: 'row', gap: 10 },
  trackMapCardButton: { flex: 1, height: 44, borderRadius: 12, backgroundColor: colors.teal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: colors.teal, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  trackMapCardText: { color: colors.white, fontFamily: fonts.bold, fontSize: 13 },
  viewDetailsButton: { flex: 1, height: 44, borderRadius: 12, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  viewDetailsText: { color: colors.teal, fontFamily: fonts.bold, fontSize: 13 },
  cancelButton: { height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FFF1F2', paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { color: '#B91C1C', fontSize: 13, fontFamily: fonts.bold },

  reviewToggle: { height: 44, borderRadius: 12, backgroundColor: colors.tealLight, justifyContent: 'center', alignItems: 'center', flexDirection: 'row' },
  reviewToggleText: { color: colors.teal, fontSize: 13, fontFamily: fonts.bold },

  reviewContainer: { marginTop: 14, gap: 12, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line },
  inputLabel: { color: colors.ink, fontSize: 12, fontFamily: fonts.semiBold },
  stars: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  starTouchable: { padding: 2 },
  star: { fontSize: 32, color: colors.line, fontFamily: fonts.regular },
  selectedStar: { color: '#F59E0B' },
  inputContainer: { flexDirection: 'row', backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, minHeight: 70, alignItems: 'flex-start' },
  inputIcon: { marginRight: 10, marginTop: 14 },
  reviewInput: { flex: 1, color: colors.ink, fontSize: 14, fontFamily: fonts.medium, paddingVertical: 12, height: 70, textAlignVertical: 'top' },
  reviewButton: { backgroundColor: colors.teal, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', shadowColor: '#0F766E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  primaryButtonText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold, letterSpacing: 0.5 },

  skeletonHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  skeletonCopy: { flex: 1, marginLeft: 12 },
  skeletonMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  skeletonActions: { flexDirection: 'row', gap: 10, marginTop: 4 },

  emptyCard: { backgroundColor: colors.white, borderRadius: 22, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: colors.line, gap: 10 },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { color: colors.ink, fontSize: 17, fontFamily: fonts.bold },
  emptyText: { color: colors.muted, fontSize: 13, fontFamily: fonts.medium, textAlign: 'center', lineHeight: 19 },
  sectionEmpty: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line, marginBottom: 14 },
  sectionEmptyText: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium },

  aiPanel: { backgroundColor: '#F2FAF8', borderWidth: 1, borderColor: '#B8E0DA', borderRadius: 14, padding: 12, marginBottom: 12 },
  aiPanelHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  aiPanelTitle: { color: colors.teal, fontSize: 13, fontFamily: fonts.bold },
  aiPanelHint: { color: colors.muted, fontSize: 11, fontFamily: fonts.regular, marginBottom: 8, lineHeight: 15 },
  aiLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  aiLoadingText: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium },
  aiMessageRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.line },
  aiMessageText: { flex: 1, color: colors.muted, fontSize: 11, fontFamily: fonts.medium, lineHeight: 15 },
  techCard: { backgroundColor: colors.white, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.line },
  techTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  techAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  techAvatarImg: { width: 40, height: 40, borderRadius: 20, marginRight: 10, backgroundColor: colors.tealLight },
  techAvatarText: { color: colors.white, fontSize: 17, fontFamily: fonts.extraBold },
  techCopy: { flex: 1, marginRight: 8 },
  techName: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, marginBottom: 4 },
  matchBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  matchBadgeValue: { color: colors.teal, fontSize: 14, fontFamily: fonts.extraBold },
  matchBadgeLabel: { color: colors.muted, fontSize: 10, fontFamily: fonts.medium },
  techConfidence: { color: colors.teal, fontSize: 10, fontFamily: fonts.bold },
  techReason: { color: colors.ink, fontSize: 11, fontFamily: fonts.medium, lineHeight: 15, marginBottom: 8 },
  techMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  techMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  techMetaText: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium },
  techSkillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  techSkillChip: { backgroundColor: colors.tealLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, maxWidth: '100%' },
  techSkillText: { color: '#075E59', fontSize: 10, fontFamily: fonts.bold },
  techActionsRow: { flexDirection: 'row', gap: 8 },
  techProfileButton: { flex: 1, height: 34, borderRadius: 9, backgroundColor: colors.tealLight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  techProfileButtonText: { color: colors.teal, fontSize: 11, fontFamily: fonts.bold },
  techMessageButton: { flex: 1, height: 34, borderRadius: 9, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  techMessageButtonText: { color: colors.ink, fontSize: 11, fontFamily: fonts.bold },
});