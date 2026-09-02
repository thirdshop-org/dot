package main

import (
	"fmt"
	"testing"
)

func TestUserCreation(t *testing.T) {

	err, userAntoine := NewUser("antoine")
	if err != nil {
		t.Errorf(`Error creating antoine user %v`, err)
	}

	err, userBob := NewUser("bob")
	if err != nil {
		t.Errorf(`Error creating bob user %v`, err)
	}

	fmt.Println(userAntoine, userBob)

}

func TestCreateDocument(t *testing.T) {

	err, document := NewDocument("paper.pdf", FILE)
	if err != nil {
		t.Errorf(`Error creating document %v`, err)
	}

	err, directory := NewDocument("bob", DIRECTORY)
	if err != nil {
		t.Errorf(`Error creating bob directory %v`, err)
	}

	fmt.Println(document, directory)

}
