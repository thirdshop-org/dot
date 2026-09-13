package com.vaultdrop.mobile.ui.scan

import android.Manifest.permission.CAMERA
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts.RequestPermission
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.Text
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.material3.TextButton
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vaultdrop.mobile.R

/**
 * Route unique du scanner — gère la permission caméra, le basculement entre
 * les 3 étapes (CAMERA/CROP/SESSION) et le retour arrière contextuel.
 *
 * Les composables d'étape n'accèdent pas à la navigation ; elles ne modifient
 * que l'état interne de [ScanViewModel].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScanFlowScreen(
    onBack: () -> Unit,
) {
    val viewModel: ScanViewModel = hiltViewModel()
    val stage by viewModel.stage.collectAsStateWithLifecycle()
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val error by viewModel.message.collectAsStateWithLifecycle()
    val exported by viewModel.exported.collectAsStateWithLifecycle()
    val pages by viewModel.pages.collectAsStateWithLifecycle()

    val context = LocalContext.current
    var hasCameraPermission by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    val launcher = rememberLauncherForActivityResult(RequestPermission()) { granted ->
        hasCameraPermission = granted
    }

    // Retour écran précédent à l'export (observé une seule fois).
    LaunchedEffect(exported) {
        if (exported) {
            viewModel.onExportedHandled()
            onBack()
        }
    }

    val snackbarHostState = remember { SnackbarHostState() }
    LaunchedEffect(error) {
        error?.let {
            snackbarHostState.showSnackbar(it, duration = SnackbarDuration.Short)
            viewModel.dismissMessage()
        }
    }

    // Retour arrière contextuel (géré par BackHandler dans le content).
    val title = when (stage) {
        ScanStage.CAMERA -> stringResource(R.string.scan_title)
        ScanStage.CROP -> stringResource(R.string.scan_crop_title)
        ScanStage.SESSION -> stringResource(R.string.scan_session_title)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    IconButton(onClick = {
                        when (stage) {
                            ScanStage.CAMERA -> { viewModel.abandon(); onBack() }
                            ScanStage.CROP -> viewModel.retake()
                            ScanStage.SESSION -> viewModel.openCamera()
                        }
                    }) {
                        Icon(
                            imageVector = androidx.compose.material.icons.Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.back),
                        )
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            when (stage) {
                ScanStage.CAMERA -> {
                    if (hasCameraPermission) {
                        CameraStage(
                            viewModel = viewModel,
                            pageCount = pages.size,
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        CameraRationale(
                            onGrant = { launcher.launch(CAMERA) },
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                }
                ScanStage.CROP -> CropStage(
                    viewModel = viewModel,
                    modifier = Modifier.fillMaxSize(),
                )
                ScanStage.SESSION -> SessionStage(
                    viewModel = viewModel,
                    pages = pages,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            if (busy) {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                )
            }
        }
    }
}

@Composable
private fun CameraRationale(
    onGrant: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = stringResource(R.string.scan_permission_rationale),
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 32.dp),
            )
            TextButton(onClick = onGrant, modifier = Modifier.padding(top = 16.dp)) {
                Text(stringResource(R.string.scan_permission_grant))
            }
        }
    }
}