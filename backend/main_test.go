package main

import (
	"fmt"
	"testing"

	"github.com/vaultdrop/backend/entities"
)

func TestUserCreation(t *testing.T) {

	err, userAntoine := entities.NewUser("antoine")
	if err != nil {
		t.Errorf(`Error creating antoine user %v`, err)
	}

	err, userBob := entities.NewUser("bob")
	if err != nil {
		t.Errorf(`Error creating bob user %v`, err)
	}

	fmt.Println(userAntoine, userBob)

}

func TestCreateDocument(t *testing.T) {

	err, document := entities.NewDocument("paper.pdf", entities.FILE)
	if err != nil {
		t.Errorf(`Error creating document %v`, err)
	}

	err, directory := entities.NewDocument("bob", entities.DIRECTORY)
	if err != nil {
		t.Errorf(`Error creating bob directory %v`, err)
	}

	fmt.Println(document, directory)

}
