package com.vaultdrop.mobile.di

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/**
 * Regroupe les bindings transverses (Domain, Ids générés, etc.).
 */
@Module
@InstallIn(SingletonComponent::class)
object AppModule