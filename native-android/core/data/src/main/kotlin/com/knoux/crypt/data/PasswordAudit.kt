package com.knoux.crypt.data

import com.knoux.crypt.security.Hashing
import com.knoux.crypt.security.PasswordStrength
import com.knoux.crypt.security.StrengthFlag
import com.knoux.crypt.security.StrengthLevel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlinx.coroutines.yield

/**
 * Local password hygiene audit over encrypted vault records (TASK 36).
 *
 * Everything happens in memory on a live, authorized session:
 *  - rows are read one at a time through [SecretRepository.find], which
 *    revalidates the capability before and after each decrypt;
 *  - strength comes from the offline [PasswordStrength] model; nothing is sent
 *    to a leak database, and there is no network permission to send it with;
 *  - duplicate detection uses a transient SHA-256 grouping digest that is
 *    dropped when the scan returns — no digest, no score and no plaintext is
 *    persisted anywhere;
 *  - the report carries record ids, decrypted titles and derived metrics only,
 *    never the password value.
 *
 * Failure semantics are deliberately non-reassuring. A lock, a cancellation or
 * a record that cannot be decrypted aborts or degrades the run instead of
 * producing a clean bill of health: see [AuditOutcome.COMPLETED_WITH_GAPS] and
 * [PasswordAuditReport.isClean].
 */
enum class AuditOutcome {
    /** Every row was read, decrypted and evaluated. */
    COMPLETED,

    /** Some rows could not be decrypted or parsed, so reuse and coverage are partial. */
    COMPLETED_WITH_GAPS,
}

data class AuditProgress(val scanned: Int, val total: Int)

data class PasswordAuditFinding(
    val recordId: String,
    val label: String,
    val level: StrengthLevel,
    val score: Int,
    val flags: Set<StrengthFlag>,
    val reused: Boolean,
    val isStale: Boolean,
    val ageDays: Long,
    val updatedAt: Long,
)

/** Records that hold the same secret. Ids and labels only, never the value. */
data class PasswordReuseCluster(
    val recordIds: List<String>,
    val labels: List<String>,
)

data class PasswordAuditReport(
    val outcome: AuditOutcome,
    val totalRecords: Int,
    val evaluated: Int,
    val unreadable: Int,
    val blankSecrets: Int,
    val levelCounts: Map<StrengthLevel, Int>,
    val findings: List<PasswordAuditFinding>,
    val reuseClusters: List<PasswordReuseCluster>,
    val staleCount: Int,
    val findingsTruncated: Boolean,
    val completedAtMillis: Long,
) {
    /**
     * True only when the scan was complete, nothing was unreadable, no secret
     * was blank, and no weak, reused or stale entry was found. The UI must not
     * present an "all clear" message when this is false.
     */
    val isClean: Boolean
        get() = outcome == AuditOutcome.COMPLETED &&
            unreadable == 0 &&
            blankSecrets == 0 &&
            staleCount == 0 &&
            findings.isEmpty() &&
            reuseClusters.isEmpty()

    val coverageFraction: Double
        get() = if (totalRecords <= 0) 0.0 else evaluated.toDouble() / totalRecords
}

class PasswordAuditService(
    private val session: SessionManager,
    private val dao: SecretDao,
    private val repository: SecretRepository,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    /**
     * Scans every stored password record. Throws [VaultLockedException] if the
     * session is revoked at any point, including between two records, and
     * [kotlinx.coroutines.CancellationException] when the caller cancels. In
     * both cases no report is produced.
     */
    suspend fun audit(
        access: VaultAccess,
        maxFindings: Int = DEFAULT_MAX_FINDINGS,
        staleAfterDays: Int = DEFAULT_STALE_DAYS,
        onProgress: (AuditProgress) -> Unit = {},
    ): PasswordAuditReport = withContext(Dispatchers.IO) {
        session.requireValid(access)
        val ids = dao.ids()
        session.requireValid(access)

        val levelCounts = LinkedHashMap<StrengthLevel, Int>()
        StrengthLevel.entries.forEach { levelCounts[it] = 0 }
        val groups = HashMap<String, MutableList<String>>()
        val labelsById = HashMap<String, String>()
        val flagged = ArrayList<PasswordAuditFinding>()
        var passwordRows = 0
        var evaluated = 0
        var unreadable = 0
        var blankSecrets = 0
        var staleCount = 0

        ids.forEachIndexed { index, id ->
            // Cooperative checkpoints: a long scan must stay cancellable and
            // must not outrun the authorization boundary.
            kotlinx.coroutines.currentCoroutineContext().ensureActive()
            yield()
            session.requireValid(access)

            val record = repository.find(access, id)
            // Notes and TOTP rows share this table; only password rows are
            // audited, so a note title can never be scored as a secret.
            if (record != null && record.kind != SecretKinds.PASSWORD) {
                onProgress(AuditProgress(index + 1, ids.size))
                return@forEachIndexed
            }
            passwordRows++
            val payload = record?.takeUnless { it.decryptionFailed }
                ?.let { SecretsJson.decodePassword(it.payloadJson) }
            if (record == null) {
                unreadable++
                onProgress(AuditProgress(index + 1, ids.size))
                return@forEachIndexed
            }
            if (payload == null) {
                unreadable++
                onProgress(AuditProgress(index + 1, ids.size))
                return@forEachIndexed
            }

            val metric = PasswordStrength.evaluate(payload.password)
            evaluated++
            levelCounts[metric.level] = (levelCounts[metric.level] ?: 0) + 1

            val label = payload.title.ifBlank { UNTITLED_LABEL }
            labelsById[id] = label
            val ageMillis = (clock() - record.updatedAt).coerceAtLeast(0L)
            val ageDays = ageMillis / MILLIS_PER_DAY
            if (ageDays >= staleAfterDays) staleCount++
            if (metric.level == StrengthLevel.EMPTY) blankSecrets++

            val needsAttention = metric.score <= WEAK_SCORE_CEILING ||
                StrengthFlag.COMMON_WORD in metric.flags ||
                StrengthFlag.COMMON_WORD_WRAPPED in metric.flags ||
                ageDays >= staleAfterDays
            if (needsAttention) {
                flagged += PasswordAuditFinding(
                    recordId = id,
                    label = label,
                    level = metric.level,
                    score = metric.score,
                    flags = metric.flags,
                    reused = false,
                    isStale = ageDays >= staleAfterDays,
                    ageDays = ageDays,
                    updatedAt = record.updatedAt,
                )
            }
            if (payload.password.isNotEmpty()) {
                val digest = Hashing.toHex(Hashing.sha256((GROUPING_CONTEXT + payload.password).toByteArray(Charsets.UTF_8)))
                groups.getOrPut(digest) { ArrayList() } += id
            }
            onProgress(AuditProgress(index + 1, ids.size))
        }

        // Final boundary check before anything is handed back to the UI.
        session.requireValid(access)

        val reusedIds = groups.filterValues { it.size > 1 }.values
        val clusters = reusedIds.map { members ->
            PasswordReuseCluster(
                recordIds = members.toList(),
                labels = members.map { labelsById[it] ?: UNTITLED_LABEL },
            )
        }.sortedByDescending { it.recordIds.size }
        val reusedSet = reusedIds.flatten().toSet()

        val findings = flagged
            .map { finding ->
                if (finding.recordId in reusedSet) finding.copy(reused = true) else finding
            }
            .sortedWith(compareBy({ it.score }, { -it.ageDays }, { it.label }))

        val truncated = findings.size > maxFindings
        // Grouping digests are transient by contract; drop the map explicitly.
        groups.clear()

        PasswordAuditReport(
            outcome = if (unreadable == 0) AuditOutcome.COMPLETED else AuditOutcome.COMPLETED_WITH_GAPS,
            totalRecords = passwordRows,
            evaluated = evaluated,
            unreadable = unreadable,
            blankSecrets = blankSecrets,
            levelCounts = levelCounts.toMap(),
            findings = if (truncated) findings.take(maxFindings) else findings,
            reuseClusters = clusters,
            staleCount = staleCount,
            findingsTruncated = truncated,
            completedAtMillis = clock(),
        )
    }

    companion object {
        const val DEFAULT_MAX_FINDINGS = 50
        const val DEFAULT_STALE_DAYS = 365

        /** Any score at or below this level is reported for remediation. */
        private const val WEAK_SCORE_CEILING = 3 // FAIR and below
        private const val MILLIS_PER_DAY = 24L * 60L * 60L * 1000L
        private const val GROUPING_CONTEXT = "knoux.password-audit.v1:"
        private const val UNTITLED_LABEL = "Untitled"
    }
}
