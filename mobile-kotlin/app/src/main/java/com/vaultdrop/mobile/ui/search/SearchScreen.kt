package com.vaultdrop.mobile.ui.search

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import com.vaultdrop.mobile.R
import com.vaultdrop.mobile.ui.navigation.FloatingNavBar
import com.vaultdrop.mobile.ui.navigation.NavTab

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    selectedTab: NavTab,
    onTabSelected: (NavTab) -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(title = { Text(stringResource(R.string.search)) })
        },
        bottomBar = {
            FloatingNavBar(selected = selectedTab, onSelect = onTabSelected)
        },
    ) { padding ->
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = stringResource(R.string.search),
                textAlign = TextAlign.Center,
            )
        }
    }
}
