package com.missedcall.autotext.data.repository

import android.content.Context
import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.ktx.Firebase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object TemplateRepository {
    private const val TAG = "TemplateRepository"
    private val db = Firebase.firestore

    data class Template(
        val category: String,
        val body: String,
        val updatedAt: Long = System.currentTimeMillis()
    )

    /**
     * Fetches the template for a given category.
     * Falls back to "DEFAULT" if the specific category is not found.
     */
    suspend fun getTemplate(clientId: String, category: String): String = withContext(Dispatchers.IO) {
        try {
            // Try to get the specific category first
            val categoryDoc = db.collection("clients")
                .document(clientId)
                .collection("templates")
                .document(category)
                .get()
                .await()

            if (categoryDoc.exists) {
                return@withContext categoryDoc.getString("body") ?: getDefaultTemplate()
            }

            Log.d(TAG, "Template category $category not found, falling back to DEFAULT")

            // Fallback to DEFAULT
            val defaultDoc = db.collection("clients")
                .document(clientId)
                .collection("templates")
                .document("DEFAULT")
                .get()
                .await()

            if (defaultDoc.exists) {
                return@withContext defaultDoc.getString("body") ?: getDefaultTemplate()
            }

            getDefaultTemplate()
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching template from Firestore: ${e.localizedMessage}")
            getDefaultTemplate()
        }
    }

    private fun getDefaultTemplate(): String {
        return "Hey {NAME}, this is {BUSINESS_NAME}. I saw you called about {AI_SUMMARY}. I'm currently on a job, but I'll reach out to you shortly!"
    }
}
