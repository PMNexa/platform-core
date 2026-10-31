"""A serializer-declared `ListField` is described as `type: "list"` with
`items`: the element's own description - a plain type, or `object` with
`fields` for a nested serializer. Writes go through it like any field."""

from django.test import TestCase
from rest_framework.test import APIClient


def schema_field(response, name):
    return next(field for field in response.json()["fields"] if field["name"] == name)


class ListFieldTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.credentials(HTTP_X_AS="alice")

    def test_schema_describes_list_fields(self):
        keywords = schema_field(self.client.get("/books/schema"), "keywords")
        self.assertEqual(keywords["type"], "list")
        self.assertFalse(keywords["required"])
        self.assertEqual(keywords["items"]["type"], "string")
        self.assertNotIn("name", keywords["items"])

        quotes = schema_field(self.client.get("/books/schema"), "quotes")
        self.assertEqual(quotes["type"], "list")
        self.assertEqual(quotes["items"]["type"], "object")
        fields = {f["name"]: f for f in quotes["items"]["fields"]}
        self.assertEqual(fields["text"]["type"], "string")
        self.assertTrue(fields["text"]["required"])
        self.assertEqual(fields["page"]["type"], "integer")
        self.assertFalse(fields["page"]["required"])

    def test_list_fields_are_validated_on_write(self):
        response = self.client.post(
            "/books", {"title": "Dune", "owner": "alice", "quotes": [{"text": "Fear is the mind-killer."}]}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        response = self.client.post("/books", {"title": "Dune", "owner": "alice", "quotes": [{"page": 1}]}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.client.post("/books", {"title": "Dune", "owner": "alice", "keywords": "spice"}, format="json")
        self.assertEqual(response.status_code, 400)
